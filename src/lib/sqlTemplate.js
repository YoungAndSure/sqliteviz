function render(template, params) {
  if (!template || !params) return template

  return template.replace(/{{\s*([a-zA-Z0-9_]+)\s*}}/g, (match, key) => {
    if (!(key in params)) return match
    const value = params[key]
    if (value === undefined || value === null) return 'NULL'
    const safe = String(value).replace(/'/g, "''")
    return `'${safe}'`
  })
}

export default {
  render
}
