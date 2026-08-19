import Breadcrumbs from './Breadcrumbs.jsx';
import './PageHeader.css';

export default function PageHeader({ title, sub, actions, breadcrumbs }) {
  return (
    <div className="page-header-wrap">
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <div className="page-header">
        <div className="page-header-text">
          <h1 className="page-header-title">{title}</h1>
          {sub && <p className="page-header-sub">{sub}</p>}
        </div>
        {actions && <div className="page-header-actions">{actions}</div>}
      </div>
    </div>
  );
}
