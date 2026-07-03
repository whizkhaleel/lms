import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Trophy, Medal, Award, Crown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { certificatesApi } from '../../../shared/api';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';

const RANK_ICONS = {
  1: Crown,
  2: Medal,
  3: Medal,
};

const RANK_COLORS = {
  1: 'text-amber-400',
  2: 'text-gray-300',
  3: 'text-amber-700',
};

export default function LeaderboardPage() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({
    queryKey: ['leaderboard'],
    queryFn: () => certificatesApi.leaderboard(100).then(r => r.data.data),
  });

  const entries = data?.entries || [];
  const userXp  = data?.userXp || { total_xp: 0, level: 1 };
  const userRank = data?.userRank;

  return (
    <div>
      <div className="flex items-center gap-3 mb-8">
        <button onClick={() => navigate(-1)} className="text-gray-400 hover:text-white transition-colors">
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Leaderboard</h1>
          <p className="text-gray-400 text-sm mt-1">Top learners by XP</p>
        </div>
      </div>

      {/* Your rank */}
      <div className="card mb-6 bg-gradient-to-r from-[#0A1628] to-[#1B2D4A] border-[#3B9EE8]/30">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-[#1B2D4A] flex items-center justify-center">
            <Trophy size={20} className="text-amber-400" />
          </div>
          <div className="flex-1">
            <p className="text-sm text-gray-400">Your Rank</p>
            <p className="text-xl font-bold text-white">
              {userRank ? `#${userRank}` : 'Unranked'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-400">Level {userXp.level}</p>
            <p className="text-lg font-bold text-white">{userXp.total_xp.toLocaleString()} XP</p>
          </div>
        </div>
      </div>

      {/* Leaderboard table */}
      <div className="card p-0 overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : entries.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Trophy size={40} className="mx-auto mb-3 text-gray-700" />
            <p className="font-medium">No rankings yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider w-16">Rank</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Level</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">XP</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider text-right">Badges</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e, i) => {
                const rank = i + 1;
                const RankIcon = RANK_ICONS[rank];
                const isYou = e.id === userXp?.user_id;

                return (
                  <tr key={e.id}
                    className={clsx('border-b border-gray-800/50',
                      i % 2 === 0 && 'bg-white/[0.01]',
                      isYou && 'bg-[#3B9EE8]/5'
                    )}>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        {RankIcon ? (
                          <RankIcon size={18} className={RANK_COLORS[rank]} />
                        ) : (
                          <span className="text-sm text-gray-600 w-5 text-center">{rank}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <span className={clsx('font-medium', isYou ? 'text-[#3B9EE8]' : 'text-white')}>
                          {e.full_name}
                        </span>
                        {isYou && <span className="text-xs text-[#3B9EE8]">(you)</span>}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-gray-300">{e.level}</td>
                    <td className="px-5 py-4 text-right">
                      <span className="font-semibold text-white">{parseInt(e.total_xp).toLocaleString()}</span>
                    </td>
                    <td className="px-5 py-4 text-right text-gray-400">{e.badge_count || 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
