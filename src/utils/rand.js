// Phase 4e：确定性伪随机——同一旁白文本（seed）每次播放动效完全一致（将来导出视频不跑偏）。
import { hashKey } from './hash'

// 复用 hash.js 的 FNV-1a：hex 字符串 → 32 位无符号整数种子
export function hashString(str) {
  return parseInt(hashKey(str), 16) >>> 0
}

// mulberry32：32 位状态的经典 PRNG，返回 () => [0,1)；轻量、分布足够动效抖动用
export function mulberry32(seed) {
  let state = seed >>> 0
  return function () {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
