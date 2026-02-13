import { createRoot } from 'react-dom/client'
import App from './components/App';
import './index.css'

// نقطة دخول التطبيق الرئيسية (Main Entry Point)
createRoot(document.getElementById("root")!).render(<App />);
