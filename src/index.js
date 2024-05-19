const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:5173',
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type'],
    credentials: true
  }
});

let currentQuestionIndex = 0;
const questions = [
  {
    question: "What is the capital of France?",
    choices: ["Paris", "London", "Berlin", "Madrid"],
    correctAnswer: "Paris"
  },
  {
    question: "What is 2 + 2?",
    choices: ["3", "4", "5", "6"],
    correctAnswer: "4"
  },
  {
    question: "What is the capital of Thailand?",
    choices: ["Bangkok", "Hanoi", "Tokyo", "Jakarta"],
    correctAnswer: "Bangkok"
  }
];

app.use(cors({
  origin: 'http://localhost:5173',
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type'],
  credentials: true
}));

const dataFilePath = path.join(__dirname, 'data/data.json');

let connectedPlayers = {};

// Function to read the existing answers from the JSON file
const readAnswersFromFile = () => {
  try {
    const data = fs.readFileSync(dataFilePath, 'utf8');
    return JSON.parse(data);
  } catch (err) {
    console.error('Error reading file:', err);
    return [];
  }
};

// Function to write answers to the JSON file
const writeAnswersToFile = (answers) => {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(answers, null, 2), 'utf8');
    console.log('Data successfully written to file');
  } catch (err) {
    console.error('Error writing file:', err);
  }
};

// Function to generate summary data
const generateSummary = (answers) => {
  const summary = questions.map((question) => {
    const correctAnswers = answers
      .filter(answer => answer.question === question.question && answer.answer === question.correctAnswer)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    return {
      question: question.question,
      correctUsers: correctAnswers.map(answer => ({
        name: answer.name,
        timestamp: answer.timestamp
      }))
    };
  });

  return summary;
};

io.on('connection', (socket) => {
  console.log('New client connected', socket.id);

  socket.on('join', (name) => {
    connectedPlayers[socket.id] = name;
    console.log('Player joined:', name);
    io.emit('playerList', Object.values(connectedPlayers));
  });

  // Send the current question to the newly connected client
  socket.emit('question', questions[currentQuestionIndex]);

  socket.on('nextQuestion', () => {
    currentQuestionIndex = (currentQuestionIndex + 1) % questions.length;
    io.emit('question', questions[currentQuestionIndex]);
  });

  socket.on('prevQuestion', () => {
    currentQuestionIndex = (currentQuestionIndex - 1 + questions.length) % questions.length;
    io.emit('question', questions[currentQuestionIndex]);
  });

  socket.on('submitAnswer', (data) => {
    const { name, answer, timestamp } = data;
    const answerData = {
      name,
      question: questions[currentQuestionIndex].question,
      answer,
      timestamp
    };

    console.log('Received answer:', answerData);

    // Check if the answer is correct
    const isCorrect = answer === questions[currentQuestionIndex].correctAnswer;

    // Read existing data from the JSON file
    let answers = readAnswersFromFile();
    console.log('Existing answers:', answers);

    // Check if the user has already submitted an answer for this question
    if (answers.some(ans => ans.name === name && ans.question === questions[currentQuestionIndex].question)) {
      console.log('User has already submitted an answer for this question:', name);
      socket.emit('answerResult', { isCorrect: false, message: 'You have already submitted an answer for this question.' });
      return;
    }

    // Add the new answer to the array
    answers.push(answerData);

    // Write the updated array back to the JSON file
    writeAnswersToFile(answers);
    console.log('Updated answers:', answers);

    // Emit the result to the client
    socket.emit('answerResult', { isCorrect });
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected', socket.id);
    delete connectedPlayers[socket.id];
    io.emit('playerList', Object.values(connectedPlayers));
  });
});

app.get('/summary', (req, res) => {
  const answers = readAnswersFromFile();
  const summary = generateSummary(answers);
  res.json(summary);
});

server.listen(4000, () => {
  console.log('Server is listening on port 4000');
});