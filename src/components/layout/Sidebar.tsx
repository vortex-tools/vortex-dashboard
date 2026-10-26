import { IconDefinition } from '@fortawesome/fontawesome-svg-core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import FeatherIcon from 'feather-icons-react';
import { capitalize } from 'helpers/utils';
import { useAppContext } from 'providers/AppProvider';
import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router';
import { Route, useNavRoutes } from 'sitemap';

const Icon = ({ icon }: { icon?: string | IconDefinition }) => (
  <span className="vx-sidebar-icon">
    {typeof icon === 'string' ? (
      <FeatherIcon icon={icon} size={14} />
    ) : icon ? (
      <FontAwesomeIcon icon={icon} fixedWidth />
    ) : null}
  </span>
);

type Loc = { pathname: string; search: string };

/** Whether `route` is where we are: its own test, else the path. */
const isHere = (route: Route, loc: Loc) =>
  route.isActive
    ? route.isActive(loc)
    : route.path === '/'
      ? loc.pathname === '/'
      : loc.pathname === route.path ||
        loc.pathname.startsWith(`${route.path}/`);

const Link = ({ route, loc }: { route: Route; loc: Loc }) => (
  <NavLink
    to={route.path}
    end={route.path === '/'}
    className={() => `vx-sidebar-link${isHere(route, loc) ? ' active' : ''}`}
  >
    <Icon icon={route.icon} />
    <span className="vx-sidebar-text">{route.name}</span>
  </NavLink>
);

/** A link with sub-pages: the parent goes to its own page and opens the
 *  list; the list stays open while one of its pages is current. */
const Parent = ({ route, loc }: { route: Route; loc: Loc }) => {
  const pages = route.pages ?? [];
  const current = pages.some(p => isHere(p, loc)) || isHere(route, loc);
  const [open, setOpen] = useState(current);
  useEffect(() => {
    if (current) setOpen(true);
  }, [current]);
  return (
    <li className={`vx-sidebar-item${open ? ' is-expanded' : ''}`}>
      <NavLink
        to={route.path}
        className={`vx-sidebar-link${current ? ' active' : ''}`}
        onClick={() => setOpen(o => (current ? true : !o))}
        aria-expanded={open}
      >
        <Icon icon={route.icon} />
        <span className="vx-sidebar-text">{route.name}</span>
        <FeatherIcon
          icon="chevron-right"
          size={12}
          className="vx-sidebar-caret"
        />
      </NavLink>
      {open && (
        <ul className="vx-sidebar-sub">
          {pages.map(p => (
            <li key={p.name}>
              <Link route={p} loc={loc} />
            </li>
          ))}
        </ul>
      )}
      <Flyout route={route} loc={loc} />
    </li>
  );
};

/** The rail's hover card: the item's name, and its sub-pages. */
const Flyout = ({ route, loc }: { route: Route; loc: Loc }) => (
  <div className="vx-sidebar-flyout">
    {route.pages ? (
      <>
        <div className="vx-sidebar-flyout-title">{route.name}</div>
        <ul>
          {route.pages.map(p => (
            <li key={p.name}>
              <Link route={p} loc={loc} />
            </li>
          ))}
        </ul>
      </>
    ) : (
      <NavLink to={route.path} className="vx-sidebar-link">
        {route.name}
      </NavLink>
    )}
  </div>
);

/**
 * The site's navigation (from sitemap.tsx), in groups. From lg it is a
 * column on the left that collapses to an icon rail (names and sub-pages
 * on hover); below lg the top bar's menu button drops it down, and going
 * to a page closes it.
 */
const Sidebar = () => {
  const { config, setSidebarCollapsed, setSidebarOpen } = useAppContext();
  const groups = useNavRoutes();
  const loc = useLocation();
  useEffect(() => {
    setSidebarOpen(false);
  }, [loc.pathname, loc.search, setSidebarOpen]);

  return (
    <nav
      className={`vx-sidebar${config.sidebarOpen ? ' is-open' : ''}`}
      aria-label="Main"
    >
      <div className="vx-sidebar-nav">
        {groups.map(g => (
          <section key={g.label} className="vx-sidebar-group">
            {!g.labelDisabled && (
              <h6 className="vx-sidebar-label">{capitalize(g.label)}</h6>
            )}
            <ul>
              {g.pages.map(r =>
                r.pages ? (
                  <Parent key={r.name} route={r} loc={loc} />
                ) : (
                  <li key={r.name} className="vx-sidebar-item">
                    <Link route={r} loc={loc} />
                    <Flyout route={r} loc={loc} />
                  </li>
                )
              )}
            </ul>
          </section>
        ))}
      </div>
      <div className="vx-sidebar-foot">
        <button
          type="button"
          className="vx-sidebar-link"
          onClick={() => setSidebarCollapsed(!config.sidebarCollapsed)}
          title={config.sidebarCollapsed ? 'Expand the sidebar' : undefined}
        >
          <Icon
            icon={config.sidebarCollapsed ? 'chevrons-right' : 'chevrons-left'}
          />
          <span className="vx-sidebar-text">Collapse</span>
        </button>
      </div>
    </nav>
  );
};

export default Sidebar;
