# UI Rollback Reference — Pre-Redesign State (2026-03-08)

Use this to revert any UI changes if the redesign doesn't work out.

## globals.css — Color Variables (BEFORE)
```css
:root {
  --background: 0 0% 100%;
  --foreground: 0 0% 5%;
  --primary: 0 0% 9%;           /* Near-black */
  --primary-foreground: 0 0% 98%;
  --secondary: 0 0% 96%;
  --muted: 0 0% 96.5%;
  --muted-foreground: 0 0% 40%;
  --accent: 0 0% 96%;
  --accent-foreground: 0 0% 9%;
  --destructive: 0 84% 60%;
  --border: 0 0% 92%;
  --input: 0 0% 92%;
  --ring: 0 0% 5%;
  --sidebar: 0 0% 99%;
}
```

## Sidebar Logo (BEFORE)
```tsx
<div className="w-7 h-7 bg-black rounded-lg flex items-center justify-center">
  <span className="text-white text-xs font-bold">G</span>
</div>
<span className="text-lg font-semibold tracking-tight">GroSpace</span>
```

## Active Nav State (BEFORE)
```
Active: bg-neutral-900 text-white
Hover: text-neutral-500 hover:text-black hover:bg-neutral-50
```

## Login Page Logo (BEFORE)
```tsx
<div className="w-10 h-10 bg-black rounded-xl flex items-center justify-center">
  <span className="text-white text-lg font-bold">G</span>
</div>
<span className="text-2xl font-semibold tracking-tight">GroSpace</span>
```

## Demo Login Button Colors (BEFORE)
- CEO: border-red-200 text-red-700 hover:bg-red-50
- CFO: border-purple-200 text-purple-700 hover:bg-purple-50
- Admin: border-blue-200 text-blue-700 hover:bg-blue-50
- Manager: border-green-200 text-green-700 hover:bg-green-50

## User Avatar (BEFORE)
```
bg-black rounded-full, white initials text
```

## Button Primary (BEFORE)
```
bg-primary (hsl 0 0% 9% = near-black) text-primary-foreground
```

## Top Bar (BEFORE)
```
h-14 bg-white border-b border-neutral-100
Search: bg-neutral-50 border-neutral-200
```

## Main Content Area (BEFORE)
```
bg-neutral-50 p-4 sm:p-6 lg:p-8
```

## Key Files Changed
- src/app/globals.css
- src/components/sidebar.tsx
- src/components/mobile-nav.tsx
- src/components/top-bar.tsx
- src/app/auth/login/page.tsx
- tailwind.config.ts (if changed)
- public/logo.svg (new file)
