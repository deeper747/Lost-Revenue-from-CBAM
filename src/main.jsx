import { StrictMode, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { ComextDataProvider } from './context/ComextDataContext.jsx'
import V4App from './V4App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ComextDataProvider>
      {createElement(V4App)}
    </ComextDataProvider>
  </StrictMode>,
)
