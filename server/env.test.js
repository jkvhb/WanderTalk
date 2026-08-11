import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { envCandidates, loadProjectEnv } from './env'

describe('项目环境文件加载', () => {
  it('普通项目只读取当前目录的 .env', () => {
    expect(envCandidates(path.join('E:', 'repo', '318'))).toEqual([
      path.join('E:', 'repo', '318', '.env'),
    ])
  })

  it('独立工作区缺少 .env 时回退到项目主目录', () => {
    const cwd = path.join('E:', 'repo', '318', '.worktrees', 'authoritative-route')
    const localEnv = path.join(cwd, '.env')
    const rootEnv = path.join('E:', 'repo', '318', '.env')
    const loadEnvFile = vi.fn((file) => {
      if (file === localEnv) throw Object.assign(new Error('missing'), { code: 'ENOENT' })
    })

    expect(loadProjectEnv({ cwd, loadEnvFile })).toBe(rootEnv)
    expect(loadEnvFile.mock.calls).toEqual([[localEnv], [rootEnv]])
  })

  it('工作区自己的 .env 存在时不读取主目录', () => {
    const cwd = path.join('E:', 'repo', '318', '.worktrees', 'feature')
    const loadEnvFile = vi.fn()

    expect(loadProjectEnv({ cwd, loadEnvFile })).toBe(path.join(cwd, '.env'))
    expect(loadEnvFile).toHaveBeenCalledTimes(1)
  })

  it('普通嵌套目录不会向上搜索，避免误读无关密钥', () => {
    const cwd = path.join('E:', 'repo', '318', 'tmp', 'preview')
    expect(envCandidates(cwd)).toEqual([path.join(cwd, '.env')])
  })
})
