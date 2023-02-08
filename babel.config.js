module.exports = {
  presets: [
    '@linaria',
    ['@babel/env', {targets: {node: true}, modules: false}],
    '@babel/typescript',
    [
      '@babel/preset-react',
      {
        runtime: 'automatic' // defaults to classic
      }
    ]
  ],
  plugins: ['transform-jsx-condition', 'transform-jsx-class']
};
