const express = require('express');
const router = express.Router();
const { getCollection } = require('../models/product.model');

// GET all products
router.get('/', async (req, res) => {
  const data = await getCollection().find().toArray();
  res.json(data);
});

// POST product
router.post('/', async (req, res) => {
  const product = req.body;
  const result = await getCollection().insertOne(product);
  res.json(result);
});

module.exports = router;
