'use client';

import dynamic from 'next/dynamic';

const NurbsCanvas = dynamic(() => import('@/components/Nurbs/NurbsCanvas'), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-screen text-gray-500">Loading NURBS Editor...</div>
});

export default function NurbsPage() {
    return (
        <main className="h-screen w-screen overflow-hidden">
            <NurbsCanvas />
        </main>
    );
}


