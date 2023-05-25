module.exports = {
  presets: [
    ['@babel/env', {targets: {node: true}, modules: false}],
    '@babel/typescript'
  ],
  plugins: ['transform-jsx-condition', 'transform-jsx-class']
};
