'use client';

import dynamic from 'next/dynamic';

const Editor = dynamic(() => import('./Editor'), {
    ssr: false,
    loading: () => <div className="flex items-center justify-center h-screen text-gray-500">Loading Structural Analysis Tool...</div>
});

export default function EditorWrapper() {
    return <Editor />;
}
