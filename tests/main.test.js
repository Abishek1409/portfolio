'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  clamp, drumAngle, drumPlace,
  faceHeight, easeInOutCubic, blurAmount, faceShade
} = require('../js/main.js');

test('clamp restricts values to the range', () => {
  assert.equal(clamp(0.5, 0, 1), 0.5);
  assert.equal(clamp(-2, 0, 1), 0);
  assert.equal(clamp(3, 0, 1), 1);
});

test('drumAngle maps pinned scroll to a card position and clamps', () => {
  assert.equal(drumAngle(0, 1000, 4), 0);
  assert.equal(drumAngle(500, 1000, 4), 1.5);
  assert.equal(drumAngle(1000, 1000, 4), 3);
  assert.equal(drumAngle(-50, 1000, 4), 0);
  assert.equal(drumAngle(5000, 1000, 4), 3);
  assert.equal(drumAngle(10, 0, 4), 0);
});

test('drumPlace puts the front card flat and wraps neighbours around the drum', () => {
  const front = drumPlace(0, 1.35, 0.07, 0.85);
  assert.equal(front.x, 0);
  assert.equal(front.z, 0);
  assert.equal(front.shade, 0);
  assert.equal(front.fade, 1);

  const right = drumPlace(1, 1.35, 0.07, 0.85);
  const left = drumPlace(-1, 1.35, 0.07, 0.85);
  assert.ok(right.x > 0 && left.x < 0);
  assert.ok(right.z < 0 && Math.abs(right.z - left.z) < 1e-9);
  assert.ok(right.shade > 0 && right.shade < 0.85);

  // Far cards fade out completely
  assert.equal(drumPlace(3, 1.35, 0.07, 0.85).fade, 0);
});

test('faceHeight closes the cylinder', () => {
  // Four faces form a square: side equals twice the apothem
  assert.ok(Math.abs(faceHeight(100, 4) - 200) < 1e-9);
  // Half a face subtends pi/N at the axis
  const h = faceHeight(100, 8);
  assert.ok(Math.abs(Math.atan(h / 2 / 100) - Math.PI / 8) < 1e-9);
});

test('easeInOutCubic hits its endpoints and midpoint', () => {
  assert.equal(easeInOutCubic(0), 0);
  assert.equal(easeInOutCubic(0.5), 0.5);
  assert.equal(easeInOutCubic(1), 1);
  assert.ok(easeInOutCubic(0.25) < 0.25);
});

test('blurAmount is 0 at the ends and max at mid', () => {
  assert.ok(Math.abs(blurAmount(0, 12)) < 1e-9);
  assert.ok(Math.abs(blurAmount(1, 12)) < 1e-9);
  assert.ok(Math.abs(blurAmount(0.5, 12) - 12) < 1e-9);
});

test('faceShade is 0 facing and maximal edge-on', () => {
  assert.equal(faceShade(0), 0);
  assert.ok(Math.abs(faceShade(90) - 0.65) < 1e-9);
  assert.ok(faceShade(45) > 0 && faceShade(45) < 0.65);
});
