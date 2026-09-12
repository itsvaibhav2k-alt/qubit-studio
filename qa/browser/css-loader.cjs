// Apply production component styles in the standalone React browser harness.
module.exports = function loadCSS(source) {
  return `const style = document.createElement('style');\nstyle.textContent = ${JSON.stringify(source)};\ndocument.head.appendChild(style);`;
};
