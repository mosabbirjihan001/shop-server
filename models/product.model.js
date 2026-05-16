const { getDB } = require('../config/db');

const getCollection = () => {
  return getDB().collection('products');
};

module.exports = { getCollection };
