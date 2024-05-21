const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const cors = require("cors");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "https://quiz-test-hosting.web.app",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"], // เพิ่มส่วนนี้เข้าไป
    credentials: true,
    optionsSuccessStatus: 204,
  },
  allowEIO3: true,
});

const port = process.env.PORT || 4000;

let currentQuestionIndex = 0;
const questions = [
  {
    question: "What is the capital of France?",
    choices: ["Paris", "London", "Berlin", "Madrid"],
    correctAnswer: "Paris",
  },
  {
    question: "What is 2 + 2?",
    choices: ["3", "4", "5", "6"],
    correctAnswer: "4",
  },
  {
    question: "What is the capital of Thailand?",
    choices: ["Bangkok", "Hanoi", "Tokyo", "Jakarta"],
    correctAnswer: "Bangkok",
  },
];

const totalTime = 30; // Total time for each question in seconds
const bonusPoints = 50; // Updated to reflect only the bonus points

app.use(
  cors({
    origin: "https://quiz-test-hosting.web.app",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
    optionsSuccessStatus: 204,
  })
);

const dataDirPath = path.join(__dirname, "data");
const dataFilePath = path.join(dataDirPath, "data.json");
const scoreFilePath = path.join(dataDirPath, "score.json");

console.log("Data directory path:", dataDirPath); // Logging dataDirPath
console.log("Score file path:", scoreFilePath); // Logging scoreFilePath

let connectedPlayers = {};
let quizStarted = false;
let playerScores = {}; // Track player scores

const ensureDataDirExists = () => {
  console.log("Ensuring data directory exists");
  if (!fs.existsSync(dataDirPath)) {
    fs.mkdirSync(dataDirPath);
    console.log("Data directory created");
  }
};

const readAnswersFromFile = () => {
  try {
    ensureDataDirExists();
    console.log("Reading answers from file");
    const data = fs.readFileSync(dataFilePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading file:", err);
    return [];
  }
};

const readScoresFromFile = () => {
  try {
    ensureDataDirExists();
    console.log("Reading scores from file");
    const data = fs.readFileSync(scoreFilePath, "utf8");
    return JSON.parse(data);
  } catch (err) {
    console.error("Error reading score file:", err);
    return {};
  }
};

const writeScoresToFile = (scores) => {
  try {
    ensureDataDirExists();
    console.log("Writing scores to file:", JSON.stringify(scores, null, 2)); // เพิ่มการ log ข้อมูลก่อนเขียนลงไฟล์
    fs.writeFileSync(scoreFilePath, JSON.stringify(scores, null, 2), "utf8");
    console.log("Scores successfully written to file");
  } catch (err) {
    console.error("Error writing score file:", err);
  }
};

const writeAnswersToFile = (answers) => {
  try {
    ensureDataDirExists();
    console.log("Writing answers to file");
    fs.writeFileSync(dataFilePath, JSON.stringify(answers, null, 2), "utf8");
    console.log("Data successfully written to file");
  } catch (err) {
    console.error("Error writing file:", err);
  }
};

const generateSummary = (answers) => {
  console.log("Generating summary");
  const summary = questions.map((question) => {
    const correctAnswers = answers
      .filter(
        (answer) =>
          answer.question === question.question &&
          answer.answer === question.correctAnswer
      )
      .sort((a, b) => a.timeAnswered - b.timeAnswered);

    const fastestAnswer = correctAnswers.length > 0 ? correctAnswers[0] : null;

    return {
      question: question.question,
      correctUsers: correctAnswers.map((answer) => ({
        name: answer.name,
        timestamp: answer.timestamp,
        timeAnswered: answer.timeAnswered,
      })),
      fastestAnswer: fastestAnswer
        ? {
            name: fastestAnswer.name,
            timestamp: fastestAnswer.timestamp,
            timeAnswered: fastestAnswer.timeAnswered,
          }
        : null,
    };
  });

  // Add scores to the summary
  summary.push({
    question: "Scores",
    correctUsers: Object.keys(playerScores).map((playerName) => ({
      name: playerName,
      score: playerScores[playerName],
    })),
  });

  return summary;
};

const calculateScore = (timeAnswered, correct) => {
  if (!correct) return 0;

  const timeRemaining = totalTime - timeAnswered;
  const timeFraction = timeRemaining / totalTime;
  const bonus = bonusPoints * timeFraction;
  return Math.round(bonus);
};

const sendCurrentQuestion = () => {
  if (currentQuestionIndex < questions.length) {
    io.emit("question", {
      question: questions[currentQuestionIndex].question,
      index: currentQuestionIndex,
      choices: questions[currentQuestionIndex].choices,
    });
  } else {
    checkIfQuizEnded();
  }
};

const checkIfQuizEnded = () => {
  if (currentQuestionIndex >= questions.length) {
    quizStarted = false;
    io.emit("quizEnded");
  }
};

// Load existing scores from file when server starts
playerScores = readScoresFromFile();

io.on("connection", (socket) => {
  console.log("New client connected", socket.id);

  socket.on("join", (name) => {
    connectedPlayers[socket.id] = name;
    if (!playerScores[name]) {
      playerScores[name] = 0; // Initialize player score if not present
    }
    console.log("Player joined:", name);
    io.emit("playerList", Object.values(connectedPlayers));
  });

  socket.on("startQuiz", () => {
    currentQuestionIndex = 0; // Reset to first question
    quizStarted = true;
    io.emit("quizStarted", questions.length); // Send total number of questions
    sendCurrentQuestion();
  });

  socket.on("endQuiz", () => {
    quizStarted = false;
    io.emit("quizEnded");
  });

  socket.on("nextQuestion", () => {
    if (!quizStarted) return;
    currentQuestionIndex++;
    sendCurrentQuestion();
  });

  socket.on("prevQuestion", () => {
    if (!quizStarted) return;
    currentQuestionIndex = Math.max(0, currentQuestionIndex - 1);
    sendCurrentQuestion();
  });

  socket.on("submitAnswer", (data) => {
    if (!quizStarted) return;
    const { name, answer, timestamp, timeAnswered } = data;
    const answerData = {
      name,
      question: questions[currentQuestionIndex].question,
      answer,
      timestamp,
      timeAnswered, // Add timeAnswered to the data
    };

    console.log("Received answer:", answerData);

    const isCorrect = answer === questions[currentQuestionIndex].correctAnswer;

    let answers = readAnswersFromFile();
    console.log("Existing answers:", answers);

    if (
      answers.some(
        (ans) =>
          ans.name === name &&
          ans.question === questions[currentQuestionIndex].question
      )
    ) {
      console.log(
        "User has already submitted an answer for this question:",
        name
      );
      socket.emit("answerResult", {
        isCorrect: false,
        message: "You have already submitted an answer for this question.",
      });
      return;
    }

    answers.push(answerData);
    writeAnswersToFile(answers);
    console.log("Updated answers:", answers);

    // Calculate and update score
    const score = calculateScore(timeAnswered, isCorrect);
    playerScores[name] += score;

    // Write updated scores to file
    console.log(
      "Player scores before writing to file:",
      JSON.stringify(playerScores, null, 2)
    );
    writeScoresToFile(playerScores);
    console.log(
      "Player scores after writing to file:",
      JSON.stringify(playerScores, null, 2)
    );

    socket.emit("answerResult", { isCorrect, score });
  });

  socket.on("disconnect", () => {
    console.log("Client disconnected", socket.id);
    const playerName = connectedPlayers[socket.id];
    delete connectedPlayers[socket.id];
    io.emit("playerList", Object.values(connectedPlayers));
  });
});

app.get("/summary", (req, res) => {
  const answers = readAnswersFromFile();
  const summary = generateSummary(answers);
  res.json(summary);
});

// เพิ่มเส้นทางพื้นฐานสำหรับ root path
app.get("/", (req, res) => {
  res.send("Welcome to the Quiz Game Server!");
  console.log(req);
});

server.listen(port, () => {
  console.log(`Server is listening on port ${port}`);
});
