import type { ReactNode } from 'react'

export const metadata = {
  title: 'Bookipi Flash Sale',
  description: 'Bookipi flash-sale status and purchase experience.',
}

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
