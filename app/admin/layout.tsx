import './admin.css';

export const metadata = {
  title: 'Admin Paneli — Manavgat Gençlik Merkezi',
  description: 'Manavgat Gençlik Merkezi Yönetim Sistemi',
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return <>{children}</>;
}
