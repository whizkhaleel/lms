import { useQuery } from '@tanstack/react-query';
import { useParams, Link } from 'react-router-dom';
import { Award, Download, ArrowLeft } from 'lucide-react';
import { certificatesApi } from '../../../shared/api';
import Spinner from '../../../shared/components/ui/spinner';
import { clsx } from 'clsx';
import { formatDistanceToNow } from 'date-fns';

export default function CourseCertificatesPage() {
  const { id } = useParams();

  const { data: certs = [], isLoading } = useQuery({
    queryKey: ['course-certificates', id],
    queryFn: () => certificatesApi.courseCertificates(id).then(r => r.data.data.certificates),
  });

  return (
    <div>
      <div className="flex items-center gap-4 mb-6">
        <Link to="/instructor" className="btn-ghost p-1.5 rounded-lg">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="font-display font-bold text-2xl text-white">Course Certificates</h1>
          <p className="text-gray-400 text-sm mt-1">Certificates issued for this course</p>
        </div>
      </div>

      <div className="card p-0 overflow-x-auto">
        {isLoading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : certs.length === 0 ? (
          <div className="text-center py-16">
            <Award size={40} className="text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500">No certificates issued yet</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-700 text-left">
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Student</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Email</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Certificate #</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Issued</th>
                <th className="px-5 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">PDF</th>
              </tr>
            </thead>
            <tbody>
              {certs.map((c, i) => (
                <tr key={c.id} className={clsx('border-b border-gray-800/50', i % 2 === 0 && 'bg-white/[0.01]')}>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-[#1A6FBF] flex items-center justify-center text-white text-xs font-bold">
                        {c.student_name?.charAt(0) || '?'}
                      </div>
                      <p className="font-medium text-white">{c.student_name}</p>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-gray-400">{c.email}</td>
                  <td className="px-5 py-4 font-mono text-xs text-gray-400">{c.certificate_number}</td>
                  <td className="px-5 py-4 text-gray-500 text-xs">
                    {formatDistanceToNow(new Date(c.issued_at), { addSuffix: true })}
                  </td>
                  <td className="px-5 py-4">
                    {c.file_id ? (
                      <a href={`/api/v1/files/${c.file_id}`} target="_blank" rel="noopener noreferrer"
                        className="btn-ghost p-1.5 rounded-lg" title="Download PDF">
                        <Download size={15} className="text-blue-400" />
                      </a>
                    ) : (
                      <span className="text-gray-600 text-xs">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
