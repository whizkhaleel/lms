import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Award, Download, Trophy, Medal, Star, Flame, Zap, GraduationCap, CheckCircle } from 'lucide-react';
import { certificatesApi } from '../../../shared/api';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';

const BADGE_ICONS = {
  play:       PlayIcon,
  zap:        Zap,
  star:       Star,
  award:      Award,
  graduation: GraduationCap,
  check:      CheckCircle,
  flame:      Flame,
};

function PlayIcon(props) { return <span {...props}>▶</span>; }

const XP_PER_LEVEL = 1000;

export default function CertificatesPage() {
  const { data: xpData, isLoading: xpLoading } = useQuery({
    queryKey: ['my-xp'],
    queryFn: () => certificatesApi.myXp().then(r => r.data.data),
  });
  const { data: certsData, isLoading: certsLoading } = useQuery({
    queryKey: ['my-certificates'],
    queryFn: () => certificatesApi.myCertificates().then(r => r.data.data.certificates),
  });

  const xp         = xpData?.xp || { total_xp: 0, level: 1 };
  const badges     = xpData?.badges || [];
  const certs      = certsData || [];
  const nextLevelXp = xp.level * XP_PER_LEVEL;
  const progressPct = Math.min(100, Math.round((xp.total_xp / nextLevelXp) * 100));

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Achievements</h1>
          <p className="text-gray-400 text-sm mt-1">Your certificates, XP, and badges</p>
        </div>
        <Link to="/leaderboard" className="btn-secondary btn gap-2">
          <Trophy size={16} /> Leaderboard
        </Link>
      </div>

      {/* XP & Level Card */}
      <div className="card mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center">
            <span className="text-2xl font-bold text-white">{xp.level}</span>
          </div>
          <div className="flex-1">
            <p className="text-lg font-semibold text-white">Level {xp.level}</p>
            <p className="text-xs text-gray-500">{xp.total_xp.toLocaleString()} total XP</p>
            <div className="mt-2 h-2 bg-gray-700 rounded-full max-w-xs overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 rounded-full transition-all"
                style={{ width: `${progressPct}%` }} />
            </div>
            <p className="text-xs text-gray-600 mt-1">{xp.total_xp} / {nextLevelXp} XP to next level</p>
          </div>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">

        {/* Badges */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h2 className="font-semibold text-white text-sm">Badges ({badges.length})</h2>
            <Medal size={16} className="text-gray-500" />
          </div>
          {xpLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : badges.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              <Award size={32} className="mx-auto mb-2 text-gray-700" />
              <p>No badges yet — complete lessons and courses to earn them</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 p-4">
              {badges.map(b => {
                const Icon = BADGE_ICONS[b.icon] || Award;
                return (
                  <div key={b.id} className="bg-[#0A1628] rounded-lg p-3 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-[#1B2D4A] flex items-center justify-center text-amber-400">
                      <Icon size={16} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{b.name}</p>
                      <p className="text-xs text-gray-500">{b.description}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Certificates */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
            <h2 className="font-semibold text-white text-sm">Certificates ({certs.length})</h2>
            <GraduationCap size={16} className="text-gray-500" />
          </div>
          {certsLoading ? (
            <div className="flex justify-center py-8"><Spinner /></div>
          ) : certs.length === 0 ? (
            <div className="text-center py-8 text-gray-500 text-sm">
              <GraduationCap size={32} className="mx-auto mb-2 text-gray-700" />
              <p>Complete a course to receive your certificate</p>
            </div>
          ) : (
            <div className="flex flex-col">
              {certs.map((c, i) => (
                <div key={c.id}
                  className={clsx('flex items-center gap-3 px-5 py-4 border-b border-gray-800/50',
                    i % 2 === 0 && 'bg-white/[0.01]')}>
                  <GraduationCap size={18} className="text-blue-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">{c.course_title}</p>
                    <p className="text-xs text-gray-500">{c.certificate_number}</p>
                  </div>
                  <p className="text-xs text-gray-600 flex-shrink-0 mr-3">
                    {formatDistanceToNow(new Date(c.issued_at), { addSuffix: true })}
                  </p>
                  {c.file_id && (
                    <a href={`/api/v1/files/${c.file_id}`} target="_blank" rel="noopener noreferrer"
                      className="btn-ghost p-1.5 rounded-lg" title="Download PDF">
                      <Download size={15} className="text-blue-400" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
