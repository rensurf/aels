import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { VocabPrototype } from './prototype/VocabPrototype.tsx'
import { TopicPrototype } from './prototype/TopicPrototype.tsx'

const proto = new URLSearchParams(window.location.search).get('prototype')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {proto === 'vocab' ? <VocabPrototype /> : proto === 'topics' ? <TopicPrototype /> : <App />}
  </StrictMode>,
)
