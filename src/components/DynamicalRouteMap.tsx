import dynamic from 'next/dynamic';
import React from 'react';

const DynamicalRouteMap = dynamic(() => import('./RouteMap'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-full min-h-[500px] bg-slate-900 rounded-xl flex flex-col items-center justify-center border border-slate-800 text-slate-400">
        <div className="animate-pulse flex flex-col items-center">
            <div className="w-12 h-12 border-4 border-slate-700 border-t-blue-500 rounded-full animate-spin mb-4"></div>
            <p>Preparando satélites e carregando mapas...</p>
        </div>
    </div>
  )
});

export default DynamicalRouteMap;
