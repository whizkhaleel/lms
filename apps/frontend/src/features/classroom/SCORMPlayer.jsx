import { useState, useRef, useEffect, useCallback } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Loader2, Maximize2, Minimize2, RefreshCw } from 'lucide-react';
import { clsx } from 'clsx';
import api from '../../shared/api/client';

export default function SCORMPlayer({ packageId, lessonId, courseId, onComplete }) {
  const iframeRef = useRef(null);
  const [loading, setLoading] = useState(true);
  const [fullscreen, setFullscreen] = useState(false);
  const [scormReady, setScormReady] = useState(false);
  const [error, setError] = useState(null);

  // Load existing SCO data
  const { data: scoData } = useQuery({
    queryKey: ['scorm-sco-data', packageId],
    queryFn: () => api.get(`/scorm/packages/${packageId}/sco-data`).then(r => r.data.data?.sco),
    enabled: !!packageId,
  });

  // Save SCO data mutation
  const saveScoMut = useMutation({
    mutationFn: (data) => api.post(`/scorm/packages/${packageId}/sco-data`, { lessonId, data }),
  });

  const handleMessage = useCallback((e) => {
    if (e.data?.type !== 'scorm') return;

    const { action, data, channel } = e.data;

    switch (action) {
      case 'initialize':
        // Send existing data to the iframe
        if (iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({
            type: 'scorm_data',
            data: scoData?.data || {},
          }, '*');
        }
        break;

      case 'commit':
        // Persist the SCO data
        if (data) {
          saveScoMut.mutate(data, {
            onSuccess: (res) => {
              const sco = res.data.data?.sco;
              // Check if completed/passed
              const status = sco?.lesson_status;
              if ((status === 'completed' || status === 'passed') && onComplete) {
                onComplete();
              }
            },
          });
        }
        // Respond to iframe
        if (channel && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({
            type: 'scorm_response',
            channel,
            data: { success: true },
          }, '*');
        }
        break;

      case 'finish':
        if (onComplete) onComplete();
        break;

      default:
        // Respond to synchronous requests
        if (channel && iframeRef.current?.contentWindow) {
          iframeRef.current.contentWindow.postMessage({
            type: 'scorm_response',
            channel,
            data: scoData?.data || {},
          }, '*');
        }
    }
  }, [scoData, saveScoMut, onComplete]);

  // Listen for SCORM API messages from the iframe
  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  // Listen for scorm_ready signal from iframe
  useEffect(() => {
    function readyHandler(e) {
      if (e.data?.type === 'scorm_ready') {
        setScormReady(true);
        setLoading(false);
      }
    }
    window.addEventListener('message', readyHandler);
    return () => window.removeEventListener('message', readyHandler);
  }, []);

  const scormUrl = `/api/v1/scorm/packages/${packageId}/serve`;

  const handleIframeLoad = () => {
    // Fallback: if scorm_ready wasn't received after load, stop loading after a delay
    setTimeout(() => setLoading(false), 2000);
  };

  const handleRefresh = () => {
    setLoading(true);
    setError(null);
    if (iframeRef.current) {
      iframeRef.current.src = scormUrl;
    }
  };

  return (
    <div className={clsx(
      'relative rounded-xl overflow-hidden border border-gray-700 bg-black',
      fullscreen && 'fixed inset-0 z-50 rounded-none'
    )}>
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-[#0D1B2A] border-b border-gray-700">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <div className={clsx('w-2 h-2 rounded-full',
            scormReady ? 'bg-green-400' : 'bg-amber-400'
          )} />
          <span>SCORM Content</span>
          {loading && <Loader2 size={14} className="animate-spin ml-2" />}
        </div>
        <div className="flex items-center gap-1">
          <button onClick={handleRefresh}
            className="btn-ghost p-1.5 rounded-lg" title="Refresh">
            <RefreshCw size={14} />
          </button>
          <button onClick={() => setFullscreen(f => !f)}
            className="btn-ghost p-1.5 rounded-lg"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}>
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0D1B2A] z-10">
          <div className="text-center">
            <Loader2 size={32} className="animate-spin text-blue-400 mx-auto mb-3" />
            <p className="text-sm text-gray-400">Loading SCORM content...</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="flex items-center justify-center h-96 text-center p-8">
          <div>
            <p className="text-red-400 mb-2">{error}</p>
            <button onClick={handleRefresh} className="btn-ghost text-sm">
              Try again
            </button>
          </div>
        </div>
      )}

      {/* The iframe */}
      <div className={clsx(fullscreen ? 'h-full' : 'h-[600px]')}>
        <iframe
          ref={iframeRef}
          src={scormUrl}
          className="w-full h-full border-0"
          onLoad={handleIframeLoad}
          onError={() => { setError('Failed to load SCORM content'); setLoading(false); }}
          title="SCORM Content"
          allow="fullscreen"
        />
      </div>
    </div>
  );
}
