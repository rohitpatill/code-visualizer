import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './app/App'
import { persistDrafts } from './app/store'
import './styles/index.css'

persistDrafts()

const root = document.getElementById('root')
if (!root) throw new Error('Missing #root element')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
