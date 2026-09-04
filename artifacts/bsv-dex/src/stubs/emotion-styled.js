/**
 * Standalone @emotion/styled stub.
 *
 * KEY CONSTRAINT: The Proxy target MUST be a plain function.
 * Using forwardRef() as the Proxy target causes "is not a function" errors
 * because forwardRef() returns a React object (not a callable), so the Proxy's
 * apply trap never fires when the styled factory is called as a function.
 *
 * Uses named import { createElement } (not `import React`) to avoid the
 * Rolldown namespace identifier collision described in emotion-react.js.
 */
import { createElement } from 'react';

function makeStyledProxy(tag) {
  function StyledComponent(props) {
    if (props == null) return null;
    var children = props.children;
    var resolvedTag = (props && props.as) || (typeof tag === 'string' ? tag : 'div') || 'div';
    var clean = {};
    if (props) {
      for (var k in props) {
        if (k !== 'children' && k[0] !== '$' && k !== 'as' && k !== 'ref') {
          clean[k] = props[k];
        }
      }
    }
    return createElement(resolvedTag, clean, children);
  }
  StyledComponent.displayName =
    'styled.' + (typeof tag === 'string' ? tag : (tag && (tag.displayName || tag.name)) || 'Component');

  return new Proxy(StyledComponent, {
    apply: function(_target, _thisArg, args) {
      var first = args[0];
      if (first == null)               return makeStyledProxy(tag);
      if (Array.isArray(first))        return makeStyledProxy(tag);
      if (typeof first === 'function') return makeStyledProxy(first);
      if (typeof first === 'object') {
        if (first.$$typeof != null || first.render != null || first.type != null) {
          return makeStyledProxy(first);
        }
        return makeStyledProxy(tag);
      }
      if (typeof first === 'string')   return makeStyledProxy(first);
      return makeStyledProxy(tag);
    },
    get: function(target, prop) {
      if (prop === 'prototype')             return target.prototype;
      if (prop === 'length' || prop === 'name') return target[prop];
      if (prop === 'displayName')           return target.displayName;
      if (prop === 'withComponent')         return function(t) { return makeStyledProxy(t); };
      if (prop === 'attrs')                 return function() { return makeStyledProxy(tag); };
      if (prop === 'withConfig')            return function() { return makeStyledProxy(tag); };
      if (prop === 'extend')                return function() { return makeStyledProxy(tag); };
      if (prop === '__emotion_base')        return tag;
      if (prop === '__emotion_styles')      return [];
      if (prop === '__emotion_forwardProp') return undefined;
      if (prop === 'toString')              return function() { return ''; };
      if (typeof prop === 'symbol')         return target[prop];
      return makeStyledProxy(prop);
    },
  });
}

function styledRoot(first) {
  if (first == null)               return makeStyledProxy('div');
  if (Array.isArray(first))        return makeStyledProxy('div');
  if (typeof first === 'function') return makeStyledProxy(first);
  if (typeof first === 'string')   return makeStyledProxy(first);
  if (typeof first === 'object') {
    if (first.$$typeof != null || first.render != null || first.type != null) {
      return makeStyledProxy(first);
    }
    return makeStyledProxy('div');
  }
  return makeStyledProxy('div');
}

var styled = new Proxy(styledRoot, {
  get: function(_t, prop) {
    if (typeof prop === 'symbol') return undefined;
    return makeStyledProxy(prop);
  },
});

export default styled;

export var css = function() { return ''; };

export var keyframes = function(strings) {
  if (!Array.isArray(strings)) return '';
  var r = '';
  for (var i = 0; i < strings.length; i++) {
    r += strings[i];
    if (arguments[i + 1] !== undefined) r += String(arguments[i + 1]);
  }
  return r;
};

export var Global = function() { return null; };

export var ThemeProvider = function(p) { return p.children; };

export var ThemeContext = {
  _currentValue: {},
  Provider: function(p) { return p.children; },
  Consumer: function(p) { return p.children({}); },
};

export var withTheme = function(C) { return C; };

export var useTheme = function() { return {}; };

export var injectGlobal = function() {};

export var createGlobalStyle = function() { return function() { return null; }; };
