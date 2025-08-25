/**
 * Test data index - exports all mock PR data
 */

const smallPR = require('./small-pr');
const customPR = require('./custom-pr');
const largePR = require('./large-pr');

module.exports = {
  small: smallPR,
  custom: customPR,
  large: largePR
};
