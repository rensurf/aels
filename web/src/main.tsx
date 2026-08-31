import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { VocabPrototype } from './prototype/VocabPrototype.tsx'
import { TopicPrototype } from './prototype/TopicPrototype.tsx'
import { PriorityReviewPrototype } from './prototype/PriorityReviewPrototype.tsx'
import { PriorityEditorPrototype } from './prototype/PriorityEditorPrototype.tsx'

const proto = new URLSearchParams(window.location.search).get('prototype')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {proto === 'vocab' ? <VocabPrototype />
      : proto === 'topics' ? <TopicPrototype />
      : proto === 'priority-review' ? <PriorityReviewPrototype />
      : proto === 'priority-editor' ? <PriorityEditorPrototype />
      : <App />}
  </StrictMode>,
)
