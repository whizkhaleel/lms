import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { ExternalLink, Loader2, AlertTriangle, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../shared/api/client';

export default function LTILaunch({ lessonId, courseId, onComplete }) {
  const [launching, setLaunching] = useState(true);
  const [error, setError] = useState(null);
  const formRef = useRef(null);

  // Get the LTI tool associated with this lesson
  const { data: toolData, isLoading: toolLoading } = useQuery({
    queryKey: ['lti-tool-by-lesson', courseId, lessonId],
    queryFn: () => api.get(`/lti/courses/${courseId}/lessons/${lessonId}/tool`).then(r => r.data.data),
    enabled: !!lessonId,
  });

  // Generate launch params
  const launchMut = useMutation({
    mutationFn: () => api.post(`/lti/tools/${toolData.tool.id}/launch/${courseId}/lessons/${lessonId}`),
    onSuccess: (res) => {
      const launch = res.data.data;
      // Auto-submit the form to launch the external tool
      if (formRef.current) {
        formRef.current.submit();
      }
    },
    onError: (err) => {
      setError(err.response?.data?.message || 'Failed to launch tool');
      setLaunching(false);
    },
  });

  // When we have the tool data, trigger the launch
  useEffect(() => {
    if (toolData?.tool && !launchMut.isSuccess) {
      launchMut.mutate();
    }
  }, [toolData]);

  const launch = launchMut.data;

  return (
    <div className="card">
      {/* Loading state */}
      {(launching && !launch) && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Loader2 size={36} className="animate-spin text-blue-400 mb-4" />
          <p className="text-white font-medium">Launching external tool...</p>
          <p className="text-sm text-gray-500 mt-1">
            {toolData?.tool?.title || 'LTI Tool'}
          </p>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <AlertTriangle size={36} className="text-amber-400 mb-4" />
          <p className="text-white font-medium">Launch failed</p>
          <p className="text-sm text-gray-400 mt-1 mb-4">{error}</p>
          <button onClick={() => { setError(null); setLaunching(true); launchMut.mutate(); }}
            className="btn-ghost text-sm flex items-center gap-2">
            <RefreshCw size={14} /> Try again
          </button>
        </div>
      )}

      {/* Hidden auto-submit form */}
      {launch && (
        <>
          <form ref={formRef}
            action={launch.launchUrl}
            method="POST"
            target="lti_iframe"
            style={{ display: 'none' }}>
            {Object.entries(launch.launchParams).map(([key, value]) => (
              <input key={key} type="hidden" name={key} value={String(value)} />
            ))}
          </form>

          <div className="flex items-center gap-2 px-4 py-2 bg-[#0A1628] rounded-t-lg border-b border-gray-700 text-sm text-gray-400">
            <ExternalLink size={14} />
            <span className="truncate flex-1">{launch.launchUrl}</span>
            <button onClick={() => { setLaunching(true); launchMut.mutate(); }}
              className="btn-ghost p-1 rounded-lg" title="Reload">
              <RefreshCw size={13} />
            </button>
          </div>

          <iframe
            name="lti_iframe"
            className="w-full h-[600px] border-0 rounded-b-lg"
            onLoad={() => setLaunching(false)}
            title="LTI Tool"
            allow="fullscreen"
            sandbox="allow-scripts allow-forms allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-top-navigation-by-user-activation"
          />
        </>
      )}

      {/* Fallback: manual launch link */}
      {launch && !launching && (
        <div className="px-4 py-2 bg-[#0A1628] rounded-b-lg border-t border-gray-700">
          <p className="text-xs text-gray-500">
            If the tool does not load,{' '}
            <button onClick={() => { setLaunching(true); launchMut.mutate(); }}
              className="text-blue-400 hover:underline">
              relaunch
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
