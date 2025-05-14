"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation"; // Added for navigation
import { Question, Alternative } from "../../types"; // Adjusted path for types
import {
  X,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Lightbulb,
  AlertTriangle,
} from "lucide-react"; // Import icons
import { event } from "../../utils/analytics";

// Define a type for the loaded questions, assuming direct array from JSON
type QuestionsData = Question[];

// Helper function to shuffle an array (Fisher-Yates shuffle)
const shuffleArray = <T,>(array: T[]): T[] => {
  const newArray = [...array];
  for (let i = newArray.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [newArray[i], newArray[j]] = [newArray[j], newArray[i]];
  }
  return newArray;
};

// Helper function to shuffle alternatives within a question
const shuffleAlternatives = (question: Question | null): Question | null => {
  if (!question) return null;
  // Ensure alternatives exist and is an array before shuffling
  if (!question.alternatives || !Array.isArray(question.alternatives)) {
    console.warn(
      "Question is missing alternatives or alternatives is not an array:",
      question
    );
    return question; // Return original question if alternatives are malformed
  }
  const shuffledAlts = shuffleArray([...question.alternatives]);
  return { ...question, alternatives: shuffledAlts };
};

// Utility function to get a specific number of random questions from each session
// This might be removed or simplified if not needed for single source
const getSampledQuestions = (
  allQuestions: Question[],
  questionsPerSession: number = 3 // Default might change
): Question[] => {
  const questionsBySession: Record<string, Question[]> = {};
  allQuestions.forEach((q) => {
    // pdf_filename might not be relevant if questions are from a single source
    const key = q.pdf_filename || "notes_quiz";
    if (!questionsBySession[key]) {
      questionsBySession[key] = [];
    }
    questionsBySession[key].push(q);
  });

  let sampledQuestions: Question[] = [];
  Object.values(questionsBySession).forEach((sessionQuestions) => {
    const shuffled = [...sessionQuestions].sort(() => 0.5 - Math.random());
    sampledQuestions.push(...shuffled.slice(0, questionsPerSession));
  });

  // Shuffle the final list of combined sampled questions
  return sampledQuestions.sort(() => 0.5 - Math.random());
};

export default function NotesQuizPage() {
  // Renamed component
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedSession, setSelectedSession] = useState<string>("all"); // RE-ADDED session selection state
  const [streak, setStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<string[]>([]); // RE-ADDED sessions list state
  const [answerStatus, setAnswerStatus] = useState<
    "correct" | "incorrect" | "skipped" | null
  >(null);
  const [selectedAlternativeLabel, setSelectedAlternativeLabel] = useState<
    string | null
  >(null);
  const [showQuizSetup, setShowQuizSetup] = useState(true); // For initial number of questions selection

  const [incorrectlyAnsweredQuestions, setIncorrectlyAnsweredQuestions] =
    useState<Question[]>([]);
  const [questionToReview, setQuestionToReview] = useState<Question | null>(
    null
  );
  const [numQuestions, setNumQuestions] = useState(10); // Default 10 questions
  const [answerHistory, setAnswerHistory] = useState<
    Record<string, { selectedAlternativeLabel: string; isCorrect: boolean }>
  >({});
  const [feedbackTimeoutId, setFeedbackTimeoutId] =
    useState<NodeJS.Timeout | null>(null);

  const router = useRouter();

  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);
      try {
        // MODIFIED: Fetch from the new JSON file
        const response = await fetch("/generated_marketing_questions.json");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: QuestionsData = await response.json();
        setAllQuestions(data);

        // RE-ADDED session extraction for this quiz page:
        if (data.length > 0) {
          const uniqueSessions = Array.from(
            new Set(data.map((q) => q.pdf_filename || "Unknown Source")) // Use a fallback if pdf_filename is missing
          );
          setSessions(uniqueSessions.sort()); // Sort for consistent display
        } else {
          setSessions([]);
        }

        if (data.length === 0) {
          setError("No questions found in the special quiz data source.");
        }
      } catch (e: any) {
        setError(e.message);
        console.error("Failed to load special quiz questions:", e);
      }
      setIsLoading(false);
    }
    loadInitialData();
  }, []);

  useEffect(() => {
    return () => {
      if (feedbackTimeoutId) {
        clearTimeout(feedbackTimeoutId);
      }
    };
  }, [feedbackTimeoutId, activeQuestions]);

  const startNewQuizRound = useCallback(
    // RE-ADD session parameter:
    (session: string) => {
      if (!allQuestions || allQuestions.length === 0) {
        setActiveQuestions([]);
        setCurrentQuestion(null);
        setShowQuizSetup(true); // Keep setup screen if no questions loaded
        // Optionally, display an error or notification to the user
        return;
      }

      let questionsForRound: Question[] = [];

      if (session === "all") {
        // Determine unique sources and calculate how many to sample from each
        const sourceKeys = new Set(
          allQuestions.map((q) => q.pdf_filename || "notes_quiz")
        );
        const numUniqueSources = sourceKeys.size > 0 ? sourceKeys.size : 1; // Avoid division by zero

        // Calculate how many questions to try and get from each source to aim for numQuestions in total
        const questionsToSamplePerSource = Math.ceil(
          numQuestions / numUniqueSources
        );

        // Use getSampledQuestions to get a preliminary list, sampled from each source
        const preliminaryQuestions = getSampledQuestions(
          allQuestions,
          questionsToSamplePerSource
        );

        questionsForRound = preliminaryQuestions.slice(0, numQuestions);
      } else {
        // Filter by the selected session, shuffle, and take the desired number
        const sessionQuestions = allQuestions.filter(
          (q) => (q.pdf_filename || "Unknown Source") === session
        );
        questionsForRound = [...sessionQuestions]
          .sort(() => 0.5 - Math.random())
          .slice(0, numQuestions);
      }

      // Fallback if the sampling/filtering somehow results in 0 questions,
      // but we have questions available and numQuestions > 0.
      // This is similar to the original fallback.
      if (
        questionsForRound.length === 0 &&
        allQuestions.length > 0 &&
        numQuestions > 0
      ) {
        questionsForRound = [...allQuestions]
          .sort(() => 0.5 - Math.random())
          .slice(0, Math.min(numQuestions, Math.min(5, allQuestions.length))); // Ensures not to slice more than available
      }

      setActiveQuestions(questionsForRound);
      setCurrentQuestionIndex(0);
      if (questionsForRound.length > 0) {
        setCurrentQuestion(shuffleAlternatives(questionsForRound[0])); // Shuffle alts
        setShowQuizSetup(false); // Hide setup once quiz starts
      } else {
        setCurrentQuestion(null);
        setShowQuizSetup(true); // Show setup if no questions
      }
      setStreak(0);
      setAnswerStatus(null);
      setSelectedAlternativeLabel(null);
      setIncorrectlyAnsweredQuestions([]);
      setQuestionToReview(null);
      setAnswerHistory({});
      if (feedbackTimeoutId) {
        clearTimeout(feedbackTimeoutId);
        setFeedbackTimeoutId(null);
      }
    },
    [allQuestions, numQuestions, feedbackTimeoutId] // REMOVED session from dependencies here, it's passed as arg
  );

  // Removed handlePinSubmit
  // Removed handleSelectSessionAndStart

  const handleStartQuiz = () => {
    // Track quiz start event
    event({
      action: "start_quiz",
      params: {
        session: selectedSession,
        num_questions: numQuestions,
      },
    });
    startNewQuizRound(selectedSession);
  };

  const goBackToMainPage = () => {
    // Modified to go to main page
    router.push("/");
  };

  const clearFeedbackAndTimeout = () => {
    if (feedbackTimeoutId) {
      clearTimeout(feedbackTimeoutId);
      setFeedbackTimeoutId(null);
    }
    setAnswerStatus(null);
    setSelectedAlternativeLabel(null);
  };

  const loadNextQuestion = useCallback(
    (skipped: boolean = false) => {
      clearFeedbackAndTimeout();

      if (
        activeQuestions.length > 0 &&
        currentQuestionIndex < activeQuestions.length - 1
      ) {
        const nextIndex = currentQuestionIndex + 1;
        setCurrentQuestionIndex(nextIndex);
        setCurrentQuestion(shuffleAlternatives(activeQuestions[nextIndex])); // Shuffle alts
        if (skipped) setAnswerStatus(null);
      } else {
        setCurrentQuestion(null);
      }
    },
    [activeQuestions, currentQuestionIndex, feedbackTimeoutId]
  );

  const handleAnswer = (alternative: Alternative) => {
    if (!currentQuestion || answerStatus) return;
    if (feedbackTimeoutId) clearTimeout(feedbackTimeoutId);

    const isCorrect =
      alternative.label.toUpperCase() ===
      currentQuestion.correct_answer.toUpperCase();
    setSelectedAlternativeLabel(alternative.label);

    // Track answer event
    event({
      action: "answer_question",
      params: {
        question_number: currentQuestion.number,
        is_correct: isCorrect,
        selected_answer: alternative.label,
        correct_answer: currentQuestion.correct_answer,
        session: selectedSession,
      },
    });

    setAnswerHistory((prev) => ({
      ...prev,
      [currentQuestion.number]: {
        selectedAlternativeLabel: alternative.label,
        isCorrect,
      },
    }));

    if (isCorrect) {
      setStreak((prevStreak) => prevStreak + 1);
      setAnswerStatus("correct");
    } else {
      setStreak(0);
      setAnswerStatus("incorrect");
      setIncorrectlyAnsweredQuestions((prev) => {
        if (!prev.find((q) => q.number === currentQuestion.number)) {
          return [...prev, currentQuestion];
        }
        return prev;
      });
    }

    const newTimeoutId = setTimeout(() => {
      loadNextQuestion();
      setFeedbackTimeoutId(null);
    }, 1500);
    setFeedbackTimeoutId(newTimeoutId);
  };

  const handleSkip = () => {
    if (!currentQuestion || answerStatus) return;
    clearFeedbackAndTimeout();
    setAnswerStatus("skipped");

    // Track skip event
    event({
      action: "skip_question",
      params: {
        question_number: currentQuestion.number,
        session: selectedSession,
      },
    });

    const newTimeoutId = setTimeout(() => {
      loadNextQuestion(true);
      setFeedbackTimeoutId(null);
    }, 500);
    setFeedbackTimeoutId(newTimeoutId);
  };

  const handleGoBack = () => {
    if (currentQuestionIndex > 0) {
      clearFeedbackAndTimeout();
      const prevIndex = currentQuestionIndex - 1;
      setCurrentQuestionIndex(prevIndex);
      setCurrentQuestion(shuffleAlternatives(activeQuestions[prevIndex])); // Shuffle alts
    }
  };

  const progressPercentage =
    activeQuestions.length > 0
      ? ((currentQuestionIndex + 1) / activeQuestions.length) * 100
      : 0;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-50">
        Loading Special Quiz...
      </div>
    );
  }

  if (error && !allQuestions.length) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-100 via-rose-100 to-pink-100 p-6 text-center font-[family-name:var(--font-geist-sans)]">
        <Lightbulb size={64} className="text-red-500 mb-6" />
        <h1 className="text-4xl font-bold text-red-700 mb-4">
          Oops! Something went wrong.
        </h1>
        <p className="text-lg text-slate-600 mb-8 max-w-md">
          We couldn't load the special quiz questions. Please check your
          connection or try refreshing the page.
        </p>
        <p className="text-sm text-slate-500">Error details: {error}</p>
        <button
          onClick={() => window.location.reload()}
          className="mt-8 bg-red-500 hover:bg-red-600 text-white font-semibold py-3 px-8 rounded-lg shadow-md hover:shadow-lg transition-all duration-150 ease-in-out"
        >
          Try Again
        </button>
      </div>
    );
  }

  // Simplified initial screen - only number of questions
  if (
    showQuizSetup ||
    (allQuestions.length > 0 &&
      activeQuestions.length === 0 &&
      !currentQuestion)
  ) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-50 p-6 text-center font-[family-name:var(--font-geist-sans)]">
        <Lightbulb size={64} className="text-sky-500 mb-6" />
        <h1 className="text-5xl font-bold text-sky-700 mb-3 tracking-tight">
          Special Notes Quiz
        </h1>
        <p className="text-xl text-slate-600 mb-10 max-w-lg">
          Test your knowledge from the generated notes!
        </p>

        <div className="w-full max-w-lg bg-white p-8 sm:p-10 rounded-2xl shadow-xl">
          {/* ADDED session select */}
          <label
            htmlFor="session-select-special"
            className="block text-xl font-semibold text-slate-700 mb-2 text-left"
          >
            1. Choose a topic:
          </label>
          <select
            id="session-select-special"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="block w-full p-4 text-lg border-2 border-slate-300 rounded-xl shadow-sm focus:ring-2 focus:ring-sky-500 focus:border-sky-500 bg-white text-slate-800 mb-8 transition-colors duration-150 ease-in-out hover:border-slate-400"
          >
            <option value="all">All Topics (Sampled)</option>
            {sessions.map((sessionName) => (
              <option key={sessionName} value={sessionName}>
                {sessionName.replace(".pdf", "").replace(/_/g, " ")}
              </option>
            ))}
          </select>

          <label
            htmlFor="num-questions-slider"
            className="block text-xl font-semibold text-slate-700 mb-3 text-left"
          >
            2. Number of questions:{" "}
            <span className="font-bold text-sky-600">{numQuestions}</span>
          </label>
          <input
            type="range"
            id="num-questions-slider"
            min="5"
            max={
              allQuestions.length > 0 ? Math.min(allQuestions.length, 50) : 50
            } // Dynamic max based on loaded questions
            value={numQuestions}
            onChange={(e) => setNumQuestions(parseInt(e.target.value, 10))}
            className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-sky-500 mb-8"
          />
          <button
            onClick={handleStartQuiz} // Use new handler
            disabled={allQuestions.length === 0 && !error}
            className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-4 px-6 rounded-xl text-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-150 ease-in-out disabled:bg-slate-300 disabled:shadow-none disabled:transform-none flex items-center justify-center gap-2"
          >
            Start Special Quiz <ChevronRight size={24} />
          </button>
          {allQuestions.length === 0 && !isLoading && !error && (
            <p className="text-sm text-red-500 mt-6">
              No special questions available to load. Please check the data
              source: generated_marketing_questions.json
            </p>
          )}
          {error && allQuestions.length > 0 && (
            <p className="text-sm text-orange-500 mt-6">
              Note: There was an issue loading initial data, but some questions
              might be available. Error: {error}
            </p>
          )}
        </div>
        <button
          onClick={goBackToMainPage}
          className="mt-10 text-sm text-slate-500 hover:text-slate-700 underline focus:outline-none cursor-pointer"
        >
          Back to Main Quiz Selection
        </button>
      </div>
    );
  }

  // Quiz Finished State
  if (
    !currentQuestion &&
    activeQuestions.length > 0 &&
    currentQuestionIndex >= activeQuestions.length - 1 &&
    !showQuizSetup // Use new state variable
  ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4 font-[family-name:var(--font-geist-sans)] text-slate-800">
        <h1 className="text-4xl font-bold text-sky-600 mb-6">
          Special Quiz Complete!
        </h1>
        <div className="bg-white p-8 rounded-xl shadow-2xl text-center">
          <p className="text-2xl mb-2">
            You finished:{" "}
            <span className="font-semibold">
              {selectedSession === "all"
                ? "All Topics (Special Quiz)"
                : selectedSession.replace(".pdf", "").replace(/_/g, " ")}
            </span>
          </p>
          <p className="text-3xl mb-8">
            Final Streak:{" "}
            <span className="text-sky-500 font-bold">{streak} 🔥</span>
          </p>
          <div className="space-y-4">
            <button
              onClick={() => startNewQuizRound(selectedSession)} // Pass selectedSession
              className="w-full bg-sky-500 hover:bg-sky-600 text-white font-bold py-3 px-6 rounded-lg text-lg shadow-md hover:shadow-lg transition-all"
            >
              Play Again
            </button>
            <button
              onClick={goBackToMainPage} // Go back to main page
              className="w-full bg-slate-500 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-lg text-lg shadow-md hover:shadow-lg transition-all"
            >
              Back to Main Menu
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Main Quiz UI
  return (
    <div className="flex flex-col md:flex-row min-h-screen font-[family-name:var(--font-geist-sans)] bg-slate-50 text-slate-700">
      {/* Left Panel: Quiz Area */}
      <div className="flex flex-col w-full md:w-2/3 lg:w-3/4 p-6 sm:p-8">
        {/* Header */}
        <header className="flex items-center justify-between mb-6 sm:mb-8">
          <button
            onClick={goBackToMainPage} // Go back to main page
            className="text-slate-500 hover:text-slate-700"
          >
            <X size={28} />
          </button>
          <h1 className="text-xl font-bold text-slate-700">
            {/* Display selected session or a default title */}
            {selectedSession === "all"
              ? "Special Notes Quiz - All Topics"
              : selectedSession.replace(".pdf", "").replace(/_/g, " ") +
                " - Notes"}
          </h1>
          <div className="text-xl font-semibold text-sky-500">
            &nbsp; {/* Placeholder if streak moves */}
          </div>
        </header>

        {/* Disclaimer Banner - Can be kept or removed for this quiz */}
        <div className="mb-6 p-3 bg-yellow-100 border border-yellow-300 text-yellow-700 rounded-lg text-sm flex items-center gap-2">
          <AlertTriangle size={20} className="flex-shrink-0" />
          <span>
            Please note: These questions are generated from notes and may
            contain errors.
          </span>
        </div>

        {/* Question Display */}
        {currentQuestion && (
          <div className="mb-8 flex-grow">
            <div className="bg-sky-200 dark:bg-sky-800/40 p-6 rounded-xl shadow-sm mb-8 min-h-[100px] flex items-center">
              <p className="text-xl md:text-2xl font-medium text-slate-800 dark:text-slate-100">
                {currentQuestion.question_text}
              </p>
            </div>

            {/* Alternatives */}
            <div className="space-y-3 sm:space-y-4">
              {currentQuestion.alternatives.map((alt) => {
                const isSelected = selectedAlternativeLabel === alt.label;
                const isCorrectAnswer =
                  alt.label.toUpperCase() ===
                  currentQuestion.correct_answer.toUpperCase();

                let buttonClass =
                  "w-full text-left p-4 sm:p-5 rounded-xl border-2 border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-sky-400 text-slate-700 font-medium text-base sm:text-lg";

                if (answerStatus && isSelected) {
                  buttonClass =
                    answerStatus === "correct"
                      ? "w-full text-left p-4 sm:p-5 rounded-xl border-2 border-green-500 bg-green-50 text-green-700 font-semibold text-base sm:text-lg ring-2 ring-green-500"
                      : "w-full text-left p-4 sm:p-5 rounded-xl border-2 border-red-500 bg-red-50 text-red-700 font-semibold text-base sm:text-lg ring-2 ring-red-500";
                } else if (answerStatus && isCorrectAnswer) {
                  buttonClass =
                    "w-full text-left p-4 sm:p-5 rounded-xl border-2 border-green-500 bg-green-50 text-green-700 font-semibold text-base sm:text-lg";
                } else if (answerStatus === "skipped" && isCorrectAnswer) {
                  buttonClass = // Correct color for skipped is sky blue
                    "w-full text-left p-4 sm:p-5 rounded-xl border-2 border-sky-500 bg-sky-50 text-sky-700 font-semibold text-base sm:text-lg";
                }

                return (
                  <button
                    key={alt.label}
                    onClick={() => handleAnswer(alt)}
                    disabled={!!answerStatus}
                    className={buttonClass}
                  >
                    {alt.text}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom Navigation */}
        <footer className="mt-auto pt-6 border-t border-slate-200">
          <div className="flex items-center justify-between">
            <button
              onClick={handleGoBack}
              className="flex items-center gap-2 py-3 px-5 rounded-lg border-2 border-slate-300 hover:bg-slate-100 text-slate-600 font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:border-slate-200 disabled:text-slate-400 disabled:hover:bg-transparent"
              disabled={currentQuestionIndex === 0 || !!answerStatus}
            >
              <ChevronLeft size={20} /> Back
            </button>
            <div className="text-sm font-medium text-slate-500">
              {currentQuestionIndex + 1} of {activeQuestions.length}
            </div>
            <button
              onClick={handleSkip}
              disabled={!!answerStatus || !currentQuestion}
              className="flex items-center gap-2 py-3 px-5 rounded-lg bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold transition-colors disabled:opacity-50 disabled:bg-slate-100 disabled:cursor-not-allowed"
            >
              Skip <SkipForward size={18} />
            </button>
          </div>
        </footer>
      </div>

      {/* Right Panel: Progress & Decorative */}
      <div className="w-full md:w-1/3 lg:w-1/4 bg-white md:border-l border-slate-200 p-6 sm:p-8 flex flex-col">
        <h2 className="text-lg font-semibold text-slate-700 mb-1">
          Your Progress
        </h2>
        <p className="text-sm text-slate-500 mb-3">Keep going!</p>
        <div className="w-full bg-slate-200 rounded-full h-3 mb-1 overflow-hidden">
          <div
            className="bg-sky-500 h-3 rounded-full transition-all duration-300 ease-in-out" // Theme color sky
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
        <div className="text-right text-sm font-medium text-sky-600 mb-6">
          {" "}
          {/* Theme color sky */}
          {Math.round(progressPercentage)}%
        </div>

        <div className="text-xl font-semibold text-sky-500 mb-6 text-center border-t pt-6">
          {" "}
          {/* Theme color sky */}
          Streak: {streak} 🔥
        </div>

        {/* Review Mistakes Section */}
        <div className="mt-6 border-t pt-6">
          <h3 className="text-md font-semibold text-slate-600 mb-3">
            Review Mistakes (Current Round)
          </h3>
          {incorrectlyAnsweredQuestions.length === 0 ? (
            <p className="text-slate-400 text-center text-sm py-4">
              No mistakes yet in this round! Great job! 🌟
            </p>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {incorrectlyAnsweredQuestions.map((q, index) => (
                <button
                  key={`${q.number}-${index}`}
                  onClick={() => setQuestionToReview(shuffleAlternatives(q))} // Shuffle alts for review
                  title={`Review Question ${q.number}`}
                  className="aspect-square bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-md flex items-center justify-center text-sm transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  {q.number}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="mt-auto flex-grow flex items-center justify-center bg-gradient-to-br from-sky-50 via-cyan-50 to-blue-50 rounded-lg p-4">
          {" "}
          {/* Theme color sky */}
          <p className="text-slate-400 text-center text-sm">
            Knowledge is power! 💡
          </p>
        </div>
      </div>

      {/* Review Question Modal (similar structure, colors might be themed if needed) */}
      {questionToReview && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50 transition-opacity duration-300 ease-in-out animate-fadeIn">
          <div className="bg-white dark:bg-slate-800 p-6 sm:p-8 rounded-xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto animate-scaleUp">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-700 dark:text-slate-200">
                Review Question {questionToReview.number}
              </h2>
              <button
                onClick={() => setQuestionToReview(null)}
                className="text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                <X size={28} />
              </button>
            </div>
            <div className="bg-slate-100 dark:bg-slate-700/50 p-4 rounded-lg mb-6">
              <p className="text-lg sm:text-xl font-medium text-slate-800 dark:text-slate-100">
                {questionToReview.question_text}
              </p>
            </div>
            <div className="space-y-3">
              {questionToReview.alternatives.map((alt) => {
                const isCorrect =
                  alt.label.toUpperCase() ===
                  questionToReview.correct_answer.toUpperCase();
                // Modal colors can remain standard or be themed to 'sky'
                return (
                  <div
                    key={alt.label}
                    className={`p-4 rounded-lg border-2 ${
                      isCorrect
                        ? "border-green-500 bg-green-50 dark:bg-green-700/30 dark:border-green-600" // Keep green for correct distinction
                        : "border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-700"
                    }`}
                  >
                    <span
                      className={`font-bold mr-2 ${
                        isCorrect
                          ? "text-green-700 dark:text-green-300"
                          : "text-slate-600 dark:text-slate-300"
                      }`}
                    >
                      {alt.label.toUpperCase()}.
                    </span>
                    <span
                      className={`${
                        isCorrect
                          ? "text-green-800 dark:text-green-200"
                          : "text-slate-700 dark:text-slate-200"
                      }`}
                    >
                      {alt.text}
                    </span>
                  </div>
                );
              })}
            </div>
            <button
              onClick={() => setQuestionToReview(null)}
              className="mt-8 w-full bg-sky-500 hover:bg-sky-600 text-white font-semibold py-3 rounded-lg shadow-md transition-colors" // Theme color sky
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
