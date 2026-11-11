import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

// scripts/install-browser.sh rewrites Ubuntu's three package hosts when a runner cannot resolve them.
// The test calls that rewrite on a temp copy, with no sudo and no browser install.

const SCRIPT = fileURLToPath(new URL('../../../scripts/install-browser.sh', import.meta.url))
const MIRROR = 'https://mirrors.edge.kernel.org/ubuntu/'

const deb822 = `\
Types: deb
URIs: http://azure.archive.ubuntu.com/ubuntu/
Suites: resolute resolute-updates resolute-backports
Components: main universe restricted multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

Types: deb
URIs: http://archive.ubuntu.com/ubuntu
Suites: resolute-updates
Components: main
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg

Types: deb
URIs: https://security.ubuntu.com/ubuntu/
Suites: resolute-security
Components: main universe restricted multiverse
Signed-By: /usr/share/keyrings/ubuntu-archive-keyring.gpg
`

const other = `\
Types: deb
URIs: https://packages.microsoft.com/repos/edge
Suites: stable
Components: main
Signed-By: /usr/share/keyrings/microsoft-edge.gpg
URIs: http://us.archive.ubuntu.com/ubuntu/
URIs: http://archive.ubuntu.com/ubuntu-ports
`

const sourcesList = `\
deb http://azure.archive.ubuntu.com/ubuntu resolute main restricted
deb http://archive.ubuntu.com/ubuntu/ resolute-updates main
deb https://security.ubuntu.com/ubuntu resolute-security main
deb https://deb.nodesource.com/node_22 nodistro main
`

test("the three Ubuntu hosts point at the second mirror", () => {
  const dir = mkdtempSync(join(tmpdir(), 'aq-apt-'))
  const listDir = join(dir, 'sources.list.d')
  mkdirSync(listDir)
  const sources = join(listDir, 'ubuntu.sources')
  const untouched = join(listDir, 'other.sources')
  const list = join(dir, 'sources.list')
  const originalOther = Buffer.from(other)
  writeFileSync(sources, deb822)
  writeFileSync(untouched, originalOther)
  writeFileSync(list, sourcesList)
  execFileSync('bash', [SCRIPT, '--rewrite', dir], { stdio: 'pipe' })

  const out = readFileSync(sources, 'utf8')
  const expected = deb822.split('\n').map(line => line.startsWith('URIs: ') ? `URIs: ${MIRROR}` : line).join('\n')
  expect(out).toBe(expected)
  expect(out.split('\n').filter(line => line.startsWith('Suites:') || line.startsWith('Components:') || line.startsWith('Signed-By:')))
    .toEqual(deb822.split('\n').filter(line => line.startsWith('Suites:') || line.startsWith('Components:') || line.startsWith('Signed-By:')))
  expect(readFileSync(untouched).equals(originalOther)).toBe(true)
  expect(readFileSync(list, 'utf8')).toBe(`\
deb ${MIRROR} resolute main restricted
deb ${MIRROR} resolute-updates main
deb ${MIRROR} resolute-security main
deb https://deb.nodesource.com/node_22 nodistro main
`)
})
