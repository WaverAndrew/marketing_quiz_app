"use client";

import { useEffect, useState, useCallback } from "react";
import { Question, Alternative } from "../types";
import {
  X,
  ChevronLeft,
  ChevronRight,
  SkipForward,
  Lightbulb,
  AlertTriangle,
} from "lucide-react"; // Import icons

// Define a type for the loaded questions, assuming direct array from JSON
type QuestionsData = Question[];

// Utility function to get a specific number of random questions from each session
const getSampledQuestions = (
  allQuestions: Question[],
  questionsPerSession: number = 3
): Question[] => {
  const questionsBySession: Record<string, Question[]> = {};
  allQuestions.forEach((q) => {
    if (!questionsBySession[q.pdf_filename]) {
      questionsBySession[q.pdf_filename] = [];
    }
    questionsBySession[q.pdf_filename].push(q);
  });

  let sampledQuestions: Question[] = [];
  Object.values(questionsBySession).forEach((sessionQuestions) => {
    const shuffled = [...sessionQuestions].sort(() => 0.5 - Math.random());
    sampledQuestions.push(...shuffled.slice(0, questionsPerSession));
  });

  // Shuffle the final list of combined sampled questions
  return sampledQuestions.sort(() => 0.5 - Math.random());
};

export default function Home() {
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [activeQuestions, setActiveQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [currentQuestion, setCurrentQuestion] = useState<Question | null>(null);
  const [selectedSession, setSelectedSession] = useState<string>("all");
  const [streak, setStreak] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<string[]>([]);
  const [answerStatus, setAnswerStatus] = useState<
    "correct" | "incorrect" | "skipped" | null
  >(null);
  const [selectedAlternativeLabel, setSelectedAlternativeLabel] = useState<
    string | null
  >(null);
  const [showSessionSelector, setShowSessionSelector] = useState(true); // Start with session selector
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

  useEffect(() => {
    async function loadInitialData() {
      setIsLoading(true);
      try {
        const response = await fetch("/extracted_marketing_questions.json");
        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data: QuestionsData = await response.json();
        setAllQuestions(data);
        const uniqueSessions = Array.from(
          new Set(data.map((q) => q.pdf_filename))
        );
        setSessions(uniqueSessions);
        if (data.length === 0) {
          setError("No questions found in the data source.");
        }
      } catch (e: any) {
        setError(e.message);
        console.error("Failed to load questions:", e);
      }
      setIsLoading(false);
    }
    loadInitialData();
  }, []);

  useEffect(() => {
    // Clear any active timeout when the component unmounts or quiz round changes significantly
    return () => {
      if (feedbackTimeoutId) {
        clearTimeout(feedbackTimeoutId);
      }
    };
  }, [feedbackTimeoutId, activeQuestions]); // Re-run if activeQuestions changes (new round)

  const startNewQuizRound = useCallback(
    (session: string) => {
      let questionsForRound: Question[] = [];

      if (session === "all") {
        // Shuffle all questions and take the desired number
        questionsForRound = [...allQuestions]
          .sort(() => 0.5 - Math.random())
          .slice(0, numQuestions);
      } else {
        // Filter by session, shuffle, and take the desired number
        const sessionQuestions = allQuestions.filter(
          (q) => q.pdf_filename === session
        );
        questionsForRound = [...sessionQuestions]
          .sort(() => 0.5 - Math.random())
          .slice(0, numQuestions);
      }
      // If sampling results in 0 (e.g. numQuestions is 0 or source is empty), fallback to a small sample if possible
      if (
        questionsForRound.length === 0 &&
        allQuestions.length > 0 &&
        numQuestions > 0
      ) {
        // This case should be rare if numQuestions > 0 and allQuestions has items
        // but as a fallback, try taking a few from all questions
        questionsForRound = [...allQuestions]
          .sort(() => 0.5 - Math.random())
          .slice(0, Math.min(numQuestions, 5));
      }

      setActiveQuestions(questionsForRound);
      setCurrentQuestionIndex(0);
      if (questionsForRound.length > 0) {
        setCurrentQuestion(questionsForRound[0]);
        setShowSessionSelector(false); // Hide session selector once quiz starts
      } else {
        setCurrentQuestion(null);
        setShowSessionSelector(true); // Show session selector if no questions for this round
      }
      setStreak(0);
      setAnswerStatus(null);
      setSelectedAlternativeLabel(null);
      setIncorrectlyAnsweredQuestions([]); // Clear mistakes for the new round
      setQuestionToReview(null); // Ensure review modal is closed
      setAnswerHistory({}); // Clear answer history for the new round
      if (feedbackTimeoutId) {
        clearTimeout(feedbackTimeoutId); // Clear any pending feedback timeout
        setFeedbackTimeoutId(null);
      }
    },
    [allQuestions, numQuestions, feedbackTimeoutId]
  );

  const handleSelectSessionAndStart = (session: string) => {
    setSelectedSession(session);
    startNewQuizRound(session);
  };

  const goToSessionSelector = () => {
    setShowSessionSelector(true);
    setCurrentQuestion(null);
    setActiveQuestions([]);
    setAnswerStatus(null);
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
        setCurrentQuestion(activeQuestions[nextIndex]);
        if (skipped) setAnswerStatus(null); // Clear skip status for next question
      } else {
        setCurrentQuestion(null); // End of quiz
      }
    },
    [activeQuestions, currentQuestionIndex, feedbackTimeoutId]
  );

  const handleAnswer = (alternative: Alternative) => {
    if (!currentQuestion || answerStatus) return;
    if (feedbackTimeoutId) clearTimeout(feedbackTimeoutId); // Clear previous timeout if any

    const isCorrect =
      alternative.label.toUpperCase() ===
      currentQuestion.correct_answer.toUpperCase();
    setSelectedAlternativeLabel(alternative.label);

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
      // Add to incorrectly answered questions list, avoid duplicates if any
      setIncorrectlyAnsweredQuestions((prev) => {
        if (!prev.find((q) => q.number === currentQuestion.number)) {
          return [...prev, currentQuestion];
        }
        return prev;
      });
    }

    const newTimeoutId = setTimeout(() => {
      loadNextQuestion();
      setFeedbackTimeoutId(null); // Clear the stored ID once executed
    }, 1500);
    setFeedbackTimeoutId(newTimeoutId);
  };

  const handleSkip = () => {
    if (!currentQuestion || answerStatus) return; // Don't skip if an answer is already processed or no question
    clearFeedbackAndTimeout();
    setAnswerStatus("skipped"); // Optional: visual feedback for skip

    // Duolingo often shows the answer when skipping
    // For simplicity here, we just move to the next question after a short delay
    const newTimeoutId = setTimeout(() => {
      loadNextQuestion(true); // Pass true to indicate it was a skip
      setFeedbackTimeoutId(null);
    }, 500); // Shorter delay for skip
    setFeedbackTimeoutId(newTimeoutId);
  };

  const handleGoBack = () => {
    if (currentQuestionIndex > 0) {
      clearFeedbackAndTimeout();
      const prevIndex = currentQuestionIndex - 1;
      setCurrentQuestionIndex(prevIndex);
      setCurrentQuestion(activeQuestions[prevIndex]);
      // Optionally, restore previous answer selection for display, but not auto-submit or change status
      // const previousAnswer = answerHistory[activeQuestions[prevIndex].number];
      // if (previousAnswer) {
      //   setSelectedAlternativeLabel(previousAnswer.selectedAlternativeLabel);
      // }
    }
  };

  const progressPercentage =
    activeQuestions.length > 0
      ? ((currentQuestionIndex + 1) / activeQuestions.length) * 100
      : 0;

  if (isLoading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-50">
        Loading...
      </div>
    );
  }

  if (error && !allQuestions.length) {
    // Only show full page error if questions didn't load at all
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-red-100 via-rose-100 to-pink-100 p-6 text-center font-[family-name:var(--font-geist-sans)]">
        <Lightbulb size={64} className="text-red-500 mb-6" />
        <h1 className="text-4xl font-bold text-red-700 mb-4">
          Oops! Something went wrong.
        </h1>
        <p className="text-lg text-slate-600 mb-8 max-w-md">
          We couldn't load the quiz questions. Please check your connection or
          try refreshing the page.
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

  if (
    showSessionSelector ||
    (allQuestions.length > 0 &&
      activeQuestions.length === 0 &&
      !currentQuestion)
  ) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-green-50 via-sky-50 to-indigo-50 p-6 text-center font-[family-name:var(--font-geist-sans)]">
        <Lightbulb size={64} className="text-green-500 mb-6" />
        <h1 className="text-5xl font-bold text-green-700 mb-3 tracking-tight">
          Marketing Quiz Challenge
        </h1>
        <p className="text-xl text-slate-600 mb-10 max-w-lg">
          With Love for Biem 15 :)
        </p>

        <div className="w-full max-w-lg bg-white p-8 sm:p-10 rounded-2xl shadow-xl">
          <label
            htmlFor="session-select"
            className="block text-xl font-semibold text-slate-700 mb-2 text-left"
          >
            1. Choose a topic:
          </label>
          <select
            id="session-select"
            value={selectedSession}
            onChange={(e) => setSelectedSession(e.target.value)}
            className="block w-full p-4 text-lg border-2 border-slate-300 rounded-xl shadow-sm focus:ring-2 focus:ring-green-500 focus:border-green-500 bg-white text-slate-800 mb-8 transition-colors duration-150 ease-in-out hover:border-slate-400"
          >
            <option value="all">All Topics (Sampled)</option>
            {sessions.map((session) => (
              <option key={session} value={session}>
                {session.replace(".pdf", "").replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <label
            htmlFor="num-questions-slider"
            className="block text-xl font-semibold text-slate-700 mb-3 text-left"
          >
            2. Number of questions:{" "}
            <span className="font-bold text-green-600">{numQuestions}</span>
          </label>
          <input
            type="range"
            id="num-questions-slider"
            min="5" // Min 5 questions
            max="50" // Max 30 questions (can be dynamic based on allQuestions.length)
            value={numQuestions}
            onChange={(e) => setNumQuestions(parseInt(e.target.value, 10))}
            className="w-full h-3 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-green-500 mb-8"
          />
          <button
            onClick={() => handleSelectSessionAndStart(selectedSession)}
            disabled={allQuestions.length === 0 && !error} // Disable if no questions AND no critical error shown above
            className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 px-6 rounded-xl text-xl shadow-lg hover:shadow-xl transform hover:scale-105 transition-all duration-150 ease-in-out disabled:bg-slate-300 disabled:shadow-none disabled:transform-none flex items-center justify-center gap-2"
          >
            Start Quiz <ChevronRight size={24} />
          </button>
          {allQuestions.length === 0 && !isLoading && !error && (
            <p className="text-sm text-red-500 mt-6">
              No questions available to load. Please check the data source.
            </p>
          )}
          {error && allQuestions.length > 0 && (
            <p className="text-sm text-orange-500 mt-6">
              Note: There was an issue loading initial data, but some questions
              might be available. Error: {error}
            </p>
          )}{" "}
          {/* Show minor error if some questions still loaded */}
        </div>
        <p className="text-sm text-slate-500 mt-10">
          Ready to learn something new?
        </p>
      </div>
    );
  }

  // Quiz Finished State
  if (
    !currentQuestion &&
    activeQuestions.length > 0 &&
    currentQuestionIndex >= activeQuestions.length - 1 &&
    !showSessionSelector
  ) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-slate-100 p-4 font-[family-name:var(--font-geist-sans)] text-slate-800">
        <h1 className="text-4xl font-bold text-green-600 mb-6">
          Quiz Complete!
        </h1>
        <div className="bg-white p-8 rounded-xl shadow-2xl text-center">
          <p className="text-2xl mb-2">
            You finished:{" "}
            <span className="font-semibold">
              {selectedSession === "all"
                ? "All Topics"
                : selectedSession.replace(".pdf", "").replace(/_/g, " ")}
            </span>
          </p>
          <p className="text-3xl mb-8">
            Final Streak:{" "}
            <span className="text-green-500 font-bold">{streak} 🔥</span>
          </p>
          <div className="space-y-4">
            <button
              onClick={() => startNewQuizRound(selectedSession)}
              className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-3 px-6 rounded-lg text-lg shadow-md hover:shadow-lg transition-all"
            >
              Play Again
            </button>
            <button
              onClick={goToSessionSelector}
              className="w-full bg-slate-500 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-lg text-lg shadow-md hover:shadow-lg transition-all"
            >
              Choose New Topic
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
            onClick={goToSessionSelector}
            className="text-slate-500 hover:text-slate-700"
          >
            <X size={28} />
          </button>
          <h1 className="text-xl font-bold text-slate-700">
            {selectedSession === "all"
              ? "Daily Review"
              : selectedSession.replace(".pdf", "").replace(/_/g, " ")}
          </h1>
          <div className="text-xl font-semibold text-green-500">
            {" "}
            {/* Streak moved to right panel as per Duolingo */}
            {/* Streak: {streak} 🔥 */} &nbsp;{" "}
            {/* Placeholder to keep alignment if needed */}
          </div>
        </header>

        {/* Disclaimer Banner */}
        <div className="mb-6 p-3 bg-yellow-100 border border-yellow-300 text-yellow-700 rounded-lg text-sm flex items-center gap-2">
          <AlertTriangle size={20} className="flex-shrink-0" />
          <span>
            Please note: Questions are student-generated and may contain errors
            as they have not been professionally reviewed.
          </span>
        </div>

        {/* Question Display */}
        {currentQuestion && (
          <div className="mb-8 flex-grow">
            <div className="bg-green-200 dark:bg-green-800/40 p-6 rounded-xl shadow-sm mb-8 min-h-[100px] flex items-center">
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
                  "w-full text-left p-4 sm:p-5 rounded-xl border-2 border-slate-200 bg-white hover:bg-slate-50 hover:border-slate-300 transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-green-400 text-slate-700 font-medium text-base sm:text-lg";

                if (answerStatus && isSelected) {
                  // Selected by user
                  buttonClass =
                    answerStatus === "correct"
                      ? "w-full text-left p-4 sm:p-5 rounded-xl border-2 border-green-500 bg-green-50 text-green-700 font-semibold text-base sm:text-lg ring-2 ring-green-500" // Correct and selected
                      : "w-full text-left p-4 sm:p-5 rounded-xl border-2 border-red-500 bg-red-50 text-red-700 font-semibold text-base sm:text-lg ring-2 ring-red-500"; // Incorrect and selected
                } else if (answerStatus && isCorrectAnswer) {
                  // Correct answer, but not necessarily selected (shown when user is wrong)
                  buttonClass =
                    "w-full text-left p-4 sm:p-5 rounded-xl border-2 border-green-500 bg-green-50 text-green-700 font-semibold text-base sm:text-lg";
                } else if (answerStatus === "skipped" && isCorrectAnswer) {
                  buttonClass =
                    "w-full text-left p-4 sm:p-5 rounded-xl border-2 border-sky-500 bg-sky-50 text-sky-700 font-semibold text-base sm:text-lg"; // Show correct if skipped
                }

                return (
                  <button
                    key={alt.label}
                    onClick={() => handleAnswer(alt)}
                    disabled={!!answerStatus}
                    className={buttonClass}
                  >
                    <span className="mr-2 font-bold">
                      {alt.label.toUpperCase()}.
                    </span>
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
              disabled={currentQuestionIndex === 0 || !!answerStatus} // Disable if first question or feedback is active
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
            className="bg-green-500 h-3 rounded-full transition-all duration-300 ease-in-out"
            style={{ width: `${progressPercentage}%` }}
          ></div>
        </div>
        <div className="text-right text-sm font-medium text-green-600 mb-6">
          {Math.round(progressPercentage)}%
        </div>

        <div className="text-xl font-semibold text-green-500 mb-6 text-center border-t pt-6">
          Streak: {streak} 🔥
        </div>

        {/* Review Mistakes Section */}
        <div className="mt-6 border-t pt-6">
          <h3 className="text-md font-semibold text-slate-600 mb-3">
            Review Mistakes (Current Round)
          </h3>
          {incorrectlyAnsweredQuestions.length === 0 ? (
            <p className="text-slate-400 text-center text-sm py-4">
              No mistakes yet in this round! Keep it up! 👍
            </p>
          ) : (
            <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {incorrectlyAnsweredQuestions.map((q, index) => (
                <button
                  key={`${q.number}-${index}`}
                  onClick={() => setQuestionToReview(q)}
                  title={`Review Question ${q.number}`}
                  className="aspect-square bg-red-100 hover:bg-red-200 text-red-700 font-bold rounded-md flex items-center justify-center text-sm transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-red-400"
                >
                  {q.number}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Placeholder for decorative image/content like Duolingo */}
        <div className="mt-auto flex-grow flex items-center justify-center bg-gradient-to-br from-green-50 via-sky-50 to-indigo-50 rounded-lg p-4">
          <p className="text-slate-400 text-center text-sm">
            {/* Replace with actual image/SVG later */}
            Future home of encouraging illustrations! 🌿
          </p>
        </div>
      </div>

      {/* Review Question Modal */}
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
                return (
                  <div
                    key={alt.label}
                    className={`p-4 rounded-lg border-2 ${
                      isCorrect
                        ? "border-green-500 bg-green-50 dark:bg-green-700/30 dark:border-green-600"
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
              className="mt-8 w-full bg-green-500 hover:bg-green-600 text-white font-semibold py-3 rounded-lg shadow-md transition-colors"
            >
              Got it!
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
