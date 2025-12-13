'use client';

import dynamic from 'next/dynamic';

const FloorWidgetCanvas = dynamic(() => import('@/components/FloorWidget/FloorWidgetCanvas'), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-screen bg-gray-200 text-gray-500">Loading Floor Widget...</div>
});

export default function FloorWidgetPage() {
    return (
        <main className="h-screen w-screen overflow-hidden">
            <FloorWidgetCanvas />
        </main>
    );
}
