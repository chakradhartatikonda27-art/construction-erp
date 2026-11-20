const { requestHandler } = require('../backend/server.js');

module.exports = (req, res) => {
  return requestHandler(req, res);
};
