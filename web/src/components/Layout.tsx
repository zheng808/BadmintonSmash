import { NavLink, Outlet, Link } from 'react-router-dom';

import { useSession } from '@/auth/session';
import { useT } from '@/i18n';

export function Layout() {
  const t = useT();
  const { session } = useSession();
  const signedIn = session.status === 'signedIn';
  const item = (to: string, label: string, icon: string, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => (isActive ? 'active' : '')}>
      <span className="ico" aria-hidden>
        {icon}
      </span>
      <span>{label}</span>
    </NavLink>
  );
  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand">
          <img src="/favicon.svg" alt="" />
          {t.appName}
        </Link>
        {!signedIn ? (
          <Link to="/sign-in" className="btn sm">
            {t.nav.signIn}
          </Link>
        ) : null}
      </header>
      <main className="container">
        <Outlet />
      </main>
      <nav className="tabbar" aria-label="main">
        {item('/', t.nav.home, '🏠', true)}
        {item('/explore', t.nav.explore, '🔍')}
        {signedIn ? item('/money', t.nav.money, '💵') : null}
        {signedIn ? item('/profile', t.nav.profile, '👤') : item('/sign-in', t.nav.signIn, '👤')}
      </nav>
    </div>
  );
}
