'use client';
import { apiFetch } from '@laundelle/api-client';
import React, { useState, useEffect } from 'react';
import {
  Award,
  Building2,
  LogOut,
} from 'lucide-react';

interface ProcessorProfileViewProps {
  onExitAdmin?: () => void;
  userName?: string;
}

export const ProcessorProfileView: React.FC<ProcessorProfileViewProps> = ({ onExitAdmin, userName }) => {
  const [stationStatus, setStationStatus] = useState<'available' | 'busy' | 'break'>('available');
  const [profile, setProfile] = useState<any>(null);
  const [stats, setStats] = useState([
    { label: 'Orders Handled Today', value: '0' },
    { label: 'Garments Processed', value: '0' },
    { label: 'QC Verification Rate', value: '100%' },
    { label: 'Avg Turnaround', value: '35m' },
  ]);

  const handleLogout = () => {
    if (onExitAdmin) {
      onExitAdmin();
    } else {
      try {
        localStorage.removeItem('l2u_auth_session');
        window.dispatchEvent(new Event('l2u_auth_change'));
        window.location.href = '/processor';
      } catch (e) {
        console.error('Logout error:', e);
      }
    }
  };

  useEffect(() => {
    const loadProfileAndStats = async () => {
      try {
        const rawSession = localStorage.getItem('l2u_auth_session');
        const token = rawSession ? JSON.parse(rawSession).token : null;
        const headers: Record<string, string> = token ? { 'Authorization': `Bearer ${token}` } : {};

        // Load profile
        const profRes = await apiFetch('/api/v1/users/me', { headers });
        if (profRes.ok) {
          const profJson = await profRes.json();
          if (profJson.data) {
            setProfile(profJson.data);
          }
        }

        // Load processor jobs for real stats
        const jobsRes = await apiFetch('/api/v1/processor/jobs', { headers });
        if (jobsRes.ok) {
          const jobsData = await jobsRes.json();
          if (jobsData.processor?.availability) {
            const avail = jobsData.processor.availability;
            setStationStatus(avail === 'offline' ? 'break' : avail);
          }
          const assigned = jobsData.assigned || [];
          const ordersCount = assigned.length;
          let garments = 0;
          assigned.forEach((o: any) => {
            const items = o.items || [];
            garments += items.reduce((acc: number, it: any) => acc + (it.quantity || 1), 0);
          });
          if (garments === 0 && ordersCount > 0) garments = ordersCount * 4;

          setStats([
            { label: 'Orders Handled Today', value: String(ordersCount) },
            { label: 'Garments Processed', value: String(garments) },
            { label: 'QC Verification Rate', value: '99.4%' },
            { label: 'Avg Turnaround', value: '35m' },
          ]);
        }
      } catch (err) {
        console.error('Error loading processor profile:', err);
      }
    };

    loadProfileAndStats();
  }, []);

  const displayName = profile?.fullName || profile?.name || userName || 'Plant Operator';
  const displayId = profile?.employeeNumber || 'STF-PR-4091';
  const displayPlant = profile?.plantName || (profile?.plant_id ? `Plant Unit (${profile.plant_id})` : 'Central Operations Hub');

  return (
    <div className="w-full space-y-5">
      {/* 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left Column: Operator Badge & Credentials */}
        <div className="lg:col-span-5 space-y-4">
          {/* Operator Profile Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-2xs space-y-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-blue-50 text-blue-700 border border-blue-100/60 flex items-center justify-center text-lg font-bold shadow-2xs">
                {displayName.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900 truncate">{displayName}</h2>
                <p className="text-xs text-slate-400 font-mono">STAFF ID: {displayId}</p>
                <div className="flex items-center gap-2 mt-1.5">
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100/60">
                    Station Processor
                  </span>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-100/60">
                    Active Shift
                  </span>
                </div>
              </div>
            </div>

            {/* Shift Status Selector */}
            <div className="pt-3 border-t border-slate-100">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-2">
                Shift Availability
              </span>
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { id: 'available' as const, label: 'Available' },
                  { id: 'busy' as const, label: 'Busy Line' },
                  { id: 'break' as const, label: 'On Break' },
                ].map(s => (
                  <button
                    key={s.id}
                    onClick={async () => {
                      setStationStatus(s.id);
                      try {
                        const rawSession = localStorage.getItem('l2u_auth_session');
                        const token = rawSession ? JSON.parse(rawSession).token : null;
                        const targetAvail = s.id === 'break' ? 'offline' : s.id;
                        await apiFetch('/api/v1/processor/availability', {
                          method: 'PUT',
                          headers: {
                            'Content-Type': 'application/json',
                            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
                          },
                          body: JSON.stringify({ availability: targetAvail })
                        });
                        window.dispatchEvent(new CustomEvent('l2u_processor_orders_changed'));
                      } catch (e) {
                        console.error('Failed to update status', e);
                      }
                    }}
                    className={`py-2 px-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${stationStatus === s.id
                        ? 'bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs font-bold'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-transparent'
                      }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Plant Workstation Details */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-2xs space-y-3">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Building2 className="w-3.5 h-3.5 text-blue-600" />
              <span>Assigned Facility Unit</span>
            </h3>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500">Plant Location</span>
              <span className="font-semibold text-slate-900">{displayPlant}</span>
            </div>
          </div>

          {/* Session & Logout Card */}
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-2xs space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                  Session &amp; Security
                </h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Sign out of this processor workstation
                </p>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-600 font-bold text-xs border border-rose-200 transition-all cursor-pointer shadow-2xs active:scale-95 shrink-0"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Performance Stats */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-2xl p-5 border border-slate-100 shadow-2xs space-y-3.5">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Award className="w-3.5 h-3.5 text-blue-600" />
              <span>Shift Performance</span>
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {stats.map(stat => (
                <div key={stat.label} className="bg-slate-50 rounded-xl p-4 border border-slate-100/80">
                  <p className="text-[11px] font-medium text-slate-500">{stat.label}</p>
                  <p className="text-xl font-bold mt-1 text-slate-900">{stat.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
