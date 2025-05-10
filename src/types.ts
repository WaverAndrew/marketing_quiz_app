export interface Alternative {
  label: string;
  text: string;
}

export interface Question {
  number: string;
  question_text: string;
  alternatives: Alternative[];
  pdf_filename: string; // This can be used to filter by session
  correct_answer: string; // Letter label, e.g., "A", "B"
}

export interface QuizSession {
  name: string;
  questions: Question[];
}

// Helper type for tracking answers
export interface UserAnswer {
  questionNumber: string;
  selectedAnswer: string;
  isCorrect: boolean;
  correctAnswer: string;
} 