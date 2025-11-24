let pyodidePromise = null

function loadPyodideScript() {
  return new Promise((resolve, reject) => {
    if (window.loadPyodide) {
      resolve()
      return
    }
    const script = document.createElement('script')
    script.src = 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/pyodide.js'
    script.onload = () => resolve()
    script.onerror = err => reject(err)
    document.head.appendChild(script)
  })
}

async function getPyodideInstance() {
  if (pyodidePromise) return pyodidePromise

  pyodidePromise = (async () => {
    await loadPyodideScript()
    const pyodide = await window.loadPyodide({
      indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.0/full/'
    })
    return pyodide
  })()

  return pyodidePromise
}

async function runSql(sql, dbBuffer) {
  const pyodide = await getPyodideInstance()

  const filename = 'db.sqlite'
  const data = dbBuffer instanceof Uint8Array ? dbBuffer : new Uint8Array(dbBuffer)

  try {
    pyodide.FS.unlink(filename)
  } catch (e) {
    // ignore if file does not exist
  }

  pyodide.FS.writeFile(filename, data)

  const code = `
import sqlite3, json
conn = sqlite3.connect('${filename}')
cur = conn.cursor()
cur.execute(${JSON.stringify(sql)})
rows = cur.fetchall()
cols = [d[0] for d in cur.description] if cur.description else []
values = { col: [row[i] for row in rows] for i, col in enumerate(cols) }
json.dumps({ 'columns': cols, 'values': values })
`

  const jsonStr = await pyodide.runPythonAsync(code)
  return JSON.parse(jsonStr)
}

export default {
  runSql
}
