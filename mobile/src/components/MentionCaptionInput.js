import { useEffect, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator } from 'react-native';
import api from '../services/api';
import colors from '../theme/colors';

const MENTION_SPLIT = /(@[A-Za-z0-9._]+)/g;
const MENTION_TAIL = /@([A-Za-z0-9._]*)$/;

export function renderMentionText(content, mentionColor = '#a78bfa') {
    const text = String(content || '');
    const parts = text.split(MENTION_SPLIT);
    if (parts.length === 1) return text;
    return parts.map((part, i) => (
        part.startsWith('@')
            ? <Text key={i} style={{ color: mentionColor, fontWeight: '800' }}>{part}</Text>
            : <Text key={i}>{part}</Text>
    ));
}

export function insertMention(text, username) {
    return String(text || '').replace(MENTION_TAIL, `@${username} `);
}

export function getMentionQuery(text) {
    const m = String(text || '').match(MENTION_TAIL);
    return m ? m[1] : null;
}

/**
 * Instagram tarzı yazı alanı: @ yazınca kullanıcı önerisi çıkar.
 * value/onChangeText dışarıda tutulur (caption state).
 */
export default function MentionCaptionInput({
    value,
    onChangeText,
    placeholder,
    placeholderTextColor = '#475569',
    style,
    multiline = true,
    maxLength = 2000,
    inputRef,
}) {
    const [suggestions, setSuggestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const timer = useRef(null);
    const query = getMentionQuery(value);

    useEffect(() => {
        if (timer.current) clearTimeout(timer.current);
        if (query === null) {
            setSuggestions([]);
            setLoading(false);
            return;
        }
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                if (query.length === 0) {
                    const { data } = await api.get('/friends');
                    const rows = Array.isArray(data) ? data : [];
                    setSuggestions(rows.slice(0, 8).map(u => ({
                        id: u.id,
                        username: u.username,
                        fullName: u.fullName,
                    })).filter(u => u.id && u.username));
                } else if (query.length >= 1) {
                    if (query.length < 2) {
                        const { data } = await api.get('/friends');
                        const rows = Array.isArray(data) ? data : [];
                        const ql = query.toLowerCase();
                        setSuggestions(rows
                            .map(u => ({
                                id: u.id,
                                username: u.username,
                                fullName: u.fullName,
                            }))
                            .filter(u => u.id && u.username && (
                                String(u.username).toLowerCase().includes(ql)
                                || String(u.fullName || '').toLowerCase().includes(ql)
                            ))
                            .slice(0, 8));
                    } else {
                        const { data } = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
                        const rows = Array.isArray(data) ? data : [];
                        setSuggestions(rows.slice(0, 8).map(u => ({
                            id: u.id,
                            username: u.username,
                            fullName: u.fullName,
                        })).filter(u => u.id && u.username));
                    }
                }
            } catch {
                setSuggestions([]);
            } finally {
                setLoading(false);
            }
        }, 250);
        return () => { if (timer.current) clearTimeout(timer.current); };
    }, [query]);

    const pick = (user) => {
        onChangeText(insertMention(value, user.username));
        setSuggestions([]);
    };

    return (
        <View>
            <TextInput
                ref={inputRef}
                style={style}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={placeholderTextColor}
                multiline={multiline}
                blurOnSubmit={false}
                maxLength={maxLength}
            />
            {query !== null && (loading || suggestions.length > 0) && (
                <ScrollView
                    keyboardShouldPersistTaps="always"
                    keyboardDismissMode="none"
                    style={{ maxHeight: 160, marginTop: 6, backgroundColor: '#1e293b', borderRadius: 10, borderWidth: 1, borderColor: '#7c3aed50' }}
                    nestedScrollEnabled>
                    {loading && suggestions.length === 0 ? (
                        <ActivityIndicator color="#a78bfa" style={{ marginVertical: 12 }} />
                    ) : suggestions.map(u => (
                        <TouchableOpacity
                            key={u.id}
                            onPress={() => pick(u)}
                            style={{ paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#334155' }}>
                            <Text style={{ color: '#a78bfa', fontSize: 12, fontWeight: '800' }}>@{u.username}</Text>
                            {!!u.fullName && <Text style={{ color: colors.textMuted, fontSize: 10 }}>{u.fullName}</Text>}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            )}
        </View>
    );
}
