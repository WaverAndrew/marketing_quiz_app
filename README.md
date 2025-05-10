# 🧠 Marketing Quiz Challenge! 🚀

Welcome to the Marketing Quiz Challenge app! This is a fun, Duolingo-inspired quiz application, **specially crafted to help my classmates ace their marketing exam.** It's designed to help you test and improve your marketing knowledge. Dive into different topics, track your progress, and aim for that winning streak!

## ✨ Features

- **Topic Selection**: Choose to answer questions from specific marketing topics (sessions) or get a random mix from all available questions.
- **Customizable Quiz Length**: Use a slider to decide how many questions you want in your quiz session (from 5 to 30).
- **Interactive Quiz Interface**:
  - Clean, modern, Duolingo-style UI.
  - Clear display of questions and multiple-choice answers.
  - Immediate feedback on whether your answer was correct or incorrect.
- **Streak Counter**: Keep track of your consecutive correct answers! 🔥
- **Progress Bar**: See how far you are through your current quiz session.
- **Review Mistakes**: Incorrectly answered questions from the current round are shown in a grid, allowing you to click and review the question with the correct answer highlighted.
- **Navigation Controls**:
  - Skip questions if you're unsure.
  - Go back to the previous question to reconsider your answer.
- **Session Management**: Start new quiz rounds, switch topics, and see a summary when you complete a session.
- **Responsive Design**: Looks great on various screen sizes.
- **Data-Driven**: Questions are loaded from an external JSON file.
- **Disclaimer**: A friendly reminder that questions are student-generated and may not be professionally reviewed.

## 🛠️ Tech Stack

- **Framework**: [Next.js](https://nextjs.org/) (React framework)
- **Language**: [TypeScript](https://www.typescriptlang.org/)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)

## 🚀 Getting Started

Follow these steps to get the Marketing Quiz Challenge app running on your local machine.

### Prerequisites

- [Node.js](https://nodejs.org/) (v16.x or later recommended)
- [npm](https://www.npmjs.com/) or [yarn](https://yarnpkg.com/)

### Installation

1.  **Clone the repository** (if you haven't already):

    ```bash
    git clone <your-repository-url>
    cd marketing-quiz-app # Or your project directory name
    ```

2.  **Install dependencies**:
    Using npm:
    ```bash
    npm install
    ```
    Or using yarn:
    ```bash
    yarn install
    ```

### Running the Development Server

1.  **Start the development server**:
    Using npm:

    ```bash
    npm run dev
    ```

    Or using yarn:

    ```bash
    yarn dev
    ```

2.  Open your browser and navigate to `http://localhost:3000` (or the port indicated in your terminal).

You should now see the app running!

## 📂 Project Structure

Here's a quick look at some key files and directories:

```
/
├── public/
│   └── extracted_marketing_questions.json  # The heart of the quiz - all questions reside here!
├── src/
│   ├── app/
│   │   ├── page.tsx                        # The main (and only) page component for the quiz app.
│   │   └── globals.css                     # Global styles, including Tailwind directives and custom animations.
│   └── types.ts                            # TypeScript interfaces for our data structures (Question, Alternative, etc.).
├── README.md                               # You are here!
├── package.json                            # Project dependencies and scripts.
├── next.config.js                          # Next.js configuration.
└── tsconfig.json                           # TypeScript configuration.
```

## 📊 Data Source

All quiz questions are sourced from the `public/extracted_marketing_questions.json` file. Each question object in this JSON file includes:

- `number`: The question number/identifier.
- `question_text`: The text of the question.
- `alternatives`: An array of possible answers, each with a `label` (e.g., "a", "b") and `text`.
- `pdf_filename`: Indicates the source session/topic of the question (used for filtering).
- `correct_answer`: The label of the correct alternative.

### ❗ A Quick Note on Questions

As highlighted in the app, the questions are student-generated and have not undergone professional review. This means there might be occasional errors or ambiguities. It's all part of the learning journey!

---

Happy quizzing! Let us know if you have any feedback or ideas. 🎉
