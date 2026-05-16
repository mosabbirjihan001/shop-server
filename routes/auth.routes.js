const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getCollection } = require('../models/user.model');

// Signup
router.post('/signup', async (req, res) => {
  const { email, password } = req.body;

  const hashed = await bcrypt.hash(password, 10);

  const result = await getCollection().insertOne({
    email,
    password: hashed
  });

  res.json(result);
});

// Login
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  const user = await getCollection().findOne({ email });

  if (!user) return res.status(404).send("User not found");

  const valid = await bcrypt.compare(password, user.password);

  if (!valid) return res.status(401).send("Wrong password");

  const token = jwt.sign({ email }, "SECRET_KEY");

  res.json({ token });
});

module.exports = router;
