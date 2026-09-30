import { Component } from 'react';
import i18n from '../i18n';

// Bir sayfa render sırasında çökünce tüm uygulama beyaz ekrana dönüyordu ve hangi
// satırın patladığı görülemiyordu — hata mesajı ekranda gösterilir, sayfa değişince sıfırlanır.
export default class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('Render crash:', error, info?.componentStack);
        this.setState({ componentStack: info?.componentStack || '' });
    }

    componentDidUpdate(prevProps) {
        if (prevProps.resetKey !== this.props.resetKey && this.state.error) this.setState({ error: null, componentStack: '' });
    }

    render() {
        const { error, componentStack } = this.state;
        if (!error) return this.props.children;
        const t = (k) => i18n.t(k);
        return (
            <div className="min-h-screen bg-[#0B0C10] flex items-center justify-center p-6">
                <div className="max-w-2xl w-full bg-[#16181F] border border-red-500/40 rounded-2xl p-6">
                    <h2 className="text-white text-xl font-bold mb-2">⚠️ {t('common.page_crashed')}</h2>
                    <p className="text-[#A8A29A] text-sm mb-4">{t('common.page_crashed_hint')}</p>
                    <pre className="bg-black/40 text-red-300 text-xs rounded-xl p-3 overflow-auto max-h-72 whitespace-pre-wrap">
                        {String(error?.message || error)}
                        {'\n\n'}
                        {(error?.stack || '').split('\n').slice(0, 6).join('\n')}
                        {componentStack ? `\n\n${componentStack.split('\n').slice(0, 8).join('\n')}` : ''}
                    </pre>
                    <div className="flex gap-2 mt-4">
                        <button onClick={() => window.location.reload()} className="bg-[#C8F54A] text-[#0B0C10] font-bold text-sm px-4 py-2 rounded-xl">
                            {t('common.reload')}
                        </button>
                        <button onClick={() => { window.location.href = '/home'; }} className="bg-[#1C1F28] border border-[#2A2D36] text-white font-bold text-sm px-4 py-2 rounded-xl">
                            {t('common.go_home')}
                        </button>
                    </div>
                </div>
            </div>
        );
    }
}
