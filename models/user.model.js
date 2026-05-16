const { getDB } = require('../config/db');

const getCollection = () => {
  return getDB().collection('users');
};

module.exports = { getCollection };
