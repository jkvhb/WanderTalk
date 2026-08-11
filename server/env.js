import path from 'node:path'

const WORKTREE_DIRS = new Set(['.worktrees', 'worktrees'])

export function envCandidates(cwd = process.cwd()) {
  const candidates = [path.join(cwd, '.env')]
  const parent = path.dirname(cwd)
  if (WORKTREE_DIRS.has(path.basename(parent))) {
    candidates.push(path.join(path.dirname(parent), '.env'))
  }
  return candidates
}

export function loadProjectEnv({
  cwd = process.cwd(),
  loadEnvFile = process.loadEnvFile?.bind(process),
} = {}) {
  if (typeof loadEnvFile !== 'function') return null
  for (const file of envCandidates(cwd)) {
    try {
      loadEnvFile(file)
      return file
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  return null
}
