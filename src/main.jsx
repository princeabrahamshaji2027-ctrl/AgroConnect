import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Bundled locally: icons must not depend on fonts.googleapis.com being reachable (offline/slow networks showed
// raw ligature names such as "person" and "lock" instead of icons).
import '@fontsource-variable/inter'
import 'material-symbols/outlined.css'
import './index.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
