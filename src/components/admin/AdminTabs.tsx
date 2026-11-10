import React from 'react';
import AdminPage from './AdminPage';
import ClubAircraftAdmin from './ClubAircraftAdmin';
import type { AdminAccess } from '../../types/admin';

type Tab = 'members' | 'aircraft';

/** The admin page: members, and the aircraft of the clubs the user administers. */
const AdminTabs: React.FC<{ access: AdminAccess }> = ({ access }) => {
  const [tab, setTab] = React.useState<Tab>('members');
  const tabClass = (t: Tab) => 'rounded-md px-3 py-1.5 text-sm font-medium transition-colors '
    + (tab === t ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground');
  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Admin" className="inline-flex gap-1 rounded-lg bg-muted p-1">
        <button type="button" role="tab" aria-selected={tab === 'members'} className={tabClass('members')}
          onClick={() => setTab('members')}>Members</button>
        <button type="button" role="tab" aria-selected={tab === 'aircraft'} className={tabClass('aircraft')}
          onClick={() => setTab('aircraft')}>Club aircraft</button>
      </div>
      {tab === 'members' ? <AdminPage access={access} /> : <ClubAircraftAdmin access={access} />}
    </div>
  );
};

export default AdminTabs;
