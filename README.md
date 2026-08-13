
Follow these steps:
# Step 3: Install the necessary dependencies.
npm i

# Step 4: Start the development server with auto-reloading and an instant preview.
npm run dev
```

## What technologies are used for this project?

This project is built with:

- Vite
- TypeScript
- React
- shadcn-ui
- Tailwind CSS

## AI Chat Feature

The POS system includes an AI chat feature for admin users to analyze sales data and profits.

### Setup

1. Get an OpenRouter API key from [openrouter.ai](https://openrouter.ai)
2. Add the API key to the following files:
   - `.env`: `OPENROUTER_API_KEY=your_token_here`
   - `admin-dashboard/.env`: `VITE_OPENROUTER_API_KEY=your_token_here`

### Features

- Analyze total revenue, costs, and profits
- View average daily, weekly, and monthly profits
- Get insights from archived sales data
- Ask questions in Arabic about business performance
- Only accessible to admin users

### Usage

1. Login as admin
2. Navigate to the "AI Chat" view
3. Ask questions about sales data, profits, or business insights
4. The AI will respond in Arabic with analysis based on real sales data
