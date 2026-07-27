// Explicit Babel config so babel-preset-expo (and its plugins) always run — notably the
// expo-widgets `'widget'` directive transform, which serializes each widget component into the
// string reference the native Widget() constructor expects. Without this the raw function reaches
// native and `createWidget` throws "2nd argument cannot be cast to type String".
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
  };
};
