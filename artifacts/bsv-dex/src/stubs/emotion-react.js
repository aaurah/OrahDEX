/**
 * Standalone @emotion/react stub.
 *
 * IMPORTANT: Must NOT import React here. Rolldown derives the namespace
 * identifier from the last path segment — both "react" and "@emotion/react"
 * would produce "import_react", causing a collision where
 * import_react.keyframes resolves to React's namespace (where it is
 * undefined) instead of this stub's function. Keeping the stub import-free
 * prevents the namespace merge entirely.
 */

export function keyframes(strings) {
  if (!Array.isArray(strings)) return '';
  var r = '';
  for (var i = 0; i < strings.length; i++) {
    r += strings[i];
    if (arguments[i + 1] !== undefined) r += String(arguments[i + 1]);
  }
  return r;
}

export var css = function() { return ''; };

export var Global = function() { return null; };

export var ClassNames = function(props) {
  return props.children({
    css: function() { return ''; },
    cx: function() { return Array.prototype.slice.call(arguments).filter(Boolean).join(' '); },
  });
};

export var ThemeContext = {
  _currentValue: {},
  _currentValue2: {},
  Provider: function(p) { return p.children; },
  Consumer: function(p) { return p.children({}); },
};

export var ThemeProvider = function(p) { return p.children; };

export var withTheme = function(C) { return C; };

export var useTheme = function() { return {}; };

export var jsx = function(type, props) {
  var children = [];
  for (var i = 2; i < arguments.length; i++) children.push(arguments[i]);
  var REACT_ELEMENT_TYPE = (typeof Symbol === 'function' && Symbol.for('react.element')) || 0xeac7;
  return {
    $$typeof: REACT_ELEMENT_TYPE,
    type: type,
    key: null,
    ref: null,
    props: Object.assign({}, props, children.length ? { children: children.length === 1 ? children[0] : children } : {}),
  };
};

export var CacheProvider = function(p) { return p.children; };

export var serializeStyles = function() { return { name: '', styles: '' }; };

export var injectGlobal = function() {};

export default {
  keyframes: keyframes,
  css: css,
  Global: Global,
  ClassNames: ClassNames,
  ThemeContext: ThemeContext,
  ThemeProvider: ThemeProvider,
  withTheme: withTheme,
  useTheme: useTheme,
  jsx: jsx,
  CacheProvider: CacheProvider,
  serializeStyles: serializeStyles,
  injectGlobal: injectGlobal,
};
