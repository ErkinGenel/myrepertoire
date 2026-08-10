/* global __firebase_config, __app_id, __initial_auth_token */
import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, signInAnonymously, signInWithCustomToken } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, deleteDoc, doc, serverTimestamp, query, orderBy } from 'firebase/firestore';
import { Music, Plus, Search, LogOut, ChevronRight, CheckCircle2, ListMusic, User as UserIcon, X, FileText, Trash2 } from 'lucide-react';

const getFirebaseConfig = () => {
    if (typeof window !== 'undefined' && window.__firebase_config) return JSON.parse(window.__firebase_config);
    if (typeof __firebase_config !== 'undefined') return JSON.parse(__firebase_config);
    // NOTE: If testing locally outside of the immersive view, you can paste your actual Firebase config object here instead of {}
    return {}; 
};

const firebaseConfig = getFirebaseConfig();
const appId = typeof window !== 'undefined' && window.__app_id ? window.__app_id : (typeof __app_id !== 'undefined' ? __app_id : 'myrepertoiregithub');

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Authentication Component
const AuthScreen = ({ isLoginMode, setIsLoginMode }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            if (isLoginMode) {
                await signInWithEmailAndPassword(auth, email, password);
            } else {
                await createUserWithEmailAndPassword(auth, email, password);
            }
        } catch (err) {
            console.error("Auth error:", err);
            setError(err.message.replace('Firebase: ', ''));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
            <div className="sm:mx-auto sm:w-full sm:max-w-md">
                <div className="flex justify-center text-indigo-600 mb-6">
                    <Music size={48} strokeWidth={1.5} />
                </div>
                <h2 className="text-center text-3xl font-extrabold text-slate-900">
                    {isLoginMode ? 'Sign in to Jam Session' : 'Create an Account'}
                </h2>
                <p className="mt-2 text-center text-sm text-slate-600">
                    {isLoginMode ? 'Or ' : 'Already have an account? '}
                    <button onClick={() => setIsLoginMode(!isLoginMode)} className="font-medium text-indigo-600 hover:text-indigo-500 focus:outline-none focus:underline transition ease-in-out duration-150">
                        {isLoginMode ? 'create a new account' : 'sign in instead'}
                    </button>
                </p>
            </div>

            <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
                <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10 border border-slate-100">
                    <form className="space-y-6" onSubmit={handleSubmit}>
                        {error && (
                            <div className="bg-red-50 border-l-4 border-red-400 p-4">
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}
                        <div>
                            <label className="block text-sm font-medium text-slate-700">Email address</label>
                            <div className="mt-1">
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700">Password</label>
                            <div className="mt-1">
                                <input
                                    type="password"
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    className="appearance-none block w-full px-3 py-2 border border-slate-300 rounded-md shadow-sm placeholder-slate-400 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                                />
                            </div>
                        </div>

                        <div>
                            <button
                                type="submit"
                                disabled={loading}
                                className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                            >
                                {loading ? 'Processing...' : (isLoginMode ? 'Sign in' : 'Create account')}
                            </button>
                        </div>
                    </form>
                </div>
            </div>
        </div>
    );
};

// Modal Components
const Modal = ({ isOpen, onClose, title, children }) => {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50">
                    <h3 className="font-semibold text-slate-800">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition p-1 rounded-md hover:bg-slate-200">
                        <X size={20} />
                    </button>
                </div>
                {children}
            </div>
        </div>
    );
};

const LyricsModal = ({ isOpen, onClose, song }) => {
    if (!isOpen || !song) return null;
    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-2 md:p-4">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
                <div className="p-4 border-b border-slate-200 flex justify-between items-center bg-slate-50 shrink-0">
                    <div className="flex-1 min-w-0 pr-4">
                        <h3 className="font-bold text-slate-800 text-xl truncate">{song.title}</h3>
                        {song.artist && <p className="text-sm text-slate-500 truncate">{song.artist}</p>}
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-slate-700 bg-slate-200 hover:bg-slate-300 p-2 rounded-full transition shrink-0">
                        <X size={24} />
                    </button>
                </div>
                <div className="p-4 md:p-6 overflow-y-auto flex-1 bg-white">
                    <pre className="font-sans text-slate-800 whitespace-pre-wrap text-base md:text-lg leading-relaxed max-w-xl mx-auto md:mx-0">
                        {song.lyrics || 'No lyrics provided for this song.'}
                    </pre>
                </div>
            </div>
        </div>
    );
};

// Main App Component
export default function App() {
    // State
    const [user, setUser] = useState(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [isLoginMode, setIsLoginMode] = useState(true);
    const [repertoire, setRepertoire] = useState([]);
    const [wishlist, setWishlist] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    
    // UI State
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [selectedSongLyrics, setSelectedSongLyrics] = useState(null);
    
    // New Song Form State
    const [newSong, setNewSong] = useState({ title: '', artist: '', genre: 'Uncategorized', lyrics: '' });
    const genres = ["Jazz", "Pop", "Rock", "Blues", "Classical", "Folk / Traditional", "Klezmer", "Other", "Uncategorized"];

    // Firebase Auth Listener
    useEffect(() => {
        const initAuth = async () => {
             // In this version, we require explicit login, but we handle the immersive token if present
             const token = typeof window !== 'undefined' && window.__initial_auth_token ? window.__initial_auth_token : (typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : undefined);
             
             if (token) {
                 try {
                     await signInWithCustomToken(auth, token);
                 } catch (e) {
                     console.error("Custom token auth failed, falling back to manual login", e);
                 }
             }
        };
        initAuth();

        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            setUser(currentUser);
            setAuthLoading(false);
        });
        return () => unsubscribe();
    }, []);

    // Firestore Listeners
    useEffect(() => {
        if (!user) {
            setRepertoire([]);
            setWishlist([]);
            return;
        }

        // We use the same public paths as before so everyone sees the same jam session data
        const repRef = collection(db, 'artifacts', appId, 'public', 'data', 'repertoire');
        const wishRef = collection(db, 'artifacts', appId, 'public', 'data', 'wishlist');

        const unsubRep = onSnapshot(repRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setRepertoire(data);
        }, (error) => console.error("Repertoire Error:", error));

        const unsubWish = onSnapshot(wishRef, (snapshot) => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setWishlist(data);
        }, (error) => console.error("Wishlist Error:", error));

        return () => {
            unsubRep();
            unsubWish();
        };
    }, [user]);

    // Handlers
    const handleLogout = () => signOut(auth);

    const handleAddSong = async (e) => {
        e.preventDefault();
        if (!newSong.title.trim() || !user) return;

        try {
            const repRef = collection(db, 'artifacts', appId, 'public', 'data', 'repertoire');
            await addDoc(repRef, {
                title: newSong.title.trim(),
                artist: newSong.artist.trim(),
                genre: newSong.genre,
                lyrics: newSong.lyrics.trim(),
                addedBy: user.email,
                userId: user.uid,
                timestamp: Date.now()
            });
            setIsAddModalOpen(false);
            setNewSong({ title: '', artist: '', genre: 'Uncategorized', lyrics: '' });
        } catch (error) {
            console.error("Error adding song:", error);
            alert("Could not save song.");
        }
    };

    const handleAddToWishlist = async (song) => {
        if (!user) return;
        
        // Prevent duplicates in queue
        if (wishlist.some(w => w.songId === song.id)) {
            alert("This song is already in the queue!");
            return;
        }

        try {
            const wishRef = collection(db, 'artifacts', appId, 'public', 'data', 'wishlist');
            await addDoc(wishRef, {
                songId: song.id,
                title: song.title,
                artist: song.artist,
                genre: song.genre || "Uncategorized",
                lyrics: song.lyrics || "",
                requestedBy: user.email.split('@')[0], // Use part of email as username for display
                requesterId: user.uid,
                timestamp: Date.now()
            });
        } catch (error) {
            console.error("Error adding to wishlist:", error);
        }
    };

    const handleRemoveFromWishlist = async (id) => {
        if (!user) return;
        try {
            await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'wishlist', id));
        } catch (error) {
            console.error("Error removing from wishlist:", error);
        }
    };

    const handleDeleteFromRepertoire = async (songId) => {
         if (!user) return;
         if(!window.confirm("Are you sure you want to delete this song from the repertoire?")) return;

         try {
             await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'repertoire', songId));
             
             // Also remove from wishlist if present
             const relatedWishlistItems = wishlist.filter(w => w.songId === songId);
             for (const item of relatedWishlistItems) {
                 await handleRemoveFromWishlist(item.id);
             }
         } catch (error) {
             console.error("Error deleting song:", error);
         }
    };

    // Derived Data Processing
    const processedRepertoire = useMemo(() => {
        // Filter
        const filtered = repertoire.filter(song => {
            const term = searchTerm.toLowerCase();
            return (song.title && song.title.toLowerCase().includes(term)) || 
                   (song.artist && song.artist.toLowerCase().includes(term));
        });

        // Group
        const grouped = filtered.reduce((acc, song) => {
            const g = song.genre && genres.includes(song.genre) ? song.genre : 'Uncategorized';
            if (!acc[g]) acc[g] = [];
            acc[g].push(song);
            return acc;
        }, {});

        // Sort Groups
        const sortedGroups = {};
        Object.keys(grouped).sort((a, b) => {
            if (a === 'Uncategorized') return 1;
            if (b === 'Uncategorized') return -1;
            return a.localeCompare(b);
        }).forEach(key => {
            // Sort songs within groups alphabetically
            sortedGroups[key] = grouped[key].sort((a, b) => (a.title || "").localeCompare(b.title || ""));
        });

        return sortedGroups;
    }, [repertoire, searchTerm]);

    const sortedWishlist = useMemo(() => {
        return [...wishlist].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    }, [wishlist]);

    if (authLoading) {
        return <div className="h-screen w-full flex items-center justify-center bg-slate-50"><div className="animate-spin text-indigo-600"><Music size={32} /></div></div>;
    }

    if (!user) {
        return <AuthScreen isLoginMode={isLoginMode} setIsLoginMode={setIsLoginMode} />;
    }

    return (
        <div className="bg-slate-100 min-h-screen flex flex-col font-sans text-slate-800">
            {/* Header */}
            <header className="bg-indigo-700 text-white shadow-md z-10 px-4 py-3 flex justify-between items-center shrink-0">
                <div className="flex items-center gap-3">
                    <Music className="w-6 h-6 sm:w-8 sm:h-8 text-indigo-200" />
                    <h1 className="text-lg sm:text-xl font-bold tracking-tight">Clarinet Jam</h1>
                </div>
                <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-2 bg-indigo-800/50 px-3 py-1 rounded-full text-sm">
                        <UserIcon size={14} className="text-indigo-300" />
                        <span className="truncate max-w-[120px]">{user.email}</span>
                    </div>
                    <button 
                        onClick={handleLogout}
                        className="text-indigo-200 hover:text-white hover:bg-indigo-600 p-2 rounded-full transition flex items-center gap-1"
                        title="Sign Out"
                    >
                        <LogOut size={18} />
                    </button>
                </div>
            </header>

            {/* Main Content */}
            <main className="flex-1 flex flex-col md:flex-row p-2 sm:p-4 gap-4 overflow-hidden h-[calc(100vh-60px)]">
                
                {/* Repertoire Section */}
                <section className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full">
                    <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-col gap-3 shrink-0">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-slate-700 flex items-center gap-2">
                                <ListMusic size={20} className="text-indigo-500" />
                                Repertoire Book
                            </h2>
                            <button 
                                onClick={() => setIsAddModalOpen(true)}
                                className="bg-indigo-600 text-white hover:bg-indigo-700 px-3 py-1.5 rounded-md text-sm font-medium transition flex items-center gap-1 shadow-sm"
                            >
                                <Plus size={16} />
                                Add Song
                            </button>
                        </div>
                        <div className="relative">
                            <Search className="w-5 h-5 absolute left-3 top-2.5 text-slate-400" />
                            <input 
                                type="text" 
                                placeholder="Search songs or artists..." 
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent text-sm transition"
                            />
                        </div>
                    </div>

                    <div className="flex-1 overflow-y-auto p-3 bg-slate-50/50">
                        {repertoire.length === 0 ? (
                            <div className="text-center text-slate-400 p-8 flex flex-col items-center justify-center h-full">
                                <Music className="w-12 h-12 mb-3 text-slate-300 opacity-50" />
                                <p>Repertoire is empty.</p>
                                <p className="text-sm mt-1">Add your first song!</p>
                            </div>
                        ) : Object.keys(processedRepertoire).length === 0 ? (
                            <div className="text-center text-slate-400 p-8">
                                <p>No songs match "{searchTerm}".</p>
                            </div>
                        ) : (
                            Object.keys(processedRepertoire).map(genre => (
                                <div key={genre} className="mb-6">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3 px-2 border-b border-slate-200 pb-1 sticky top-0 bg-slate-50/95 backdrop-blur z-10">
                                        {genre}
                                    </h3>
                                    <div className="flex flex-col gap-2">
                                        {processedRepertoire[genre].map(song => (
                                            <div key={song.id} className="group bg-white p-3 rounded-lg border border-slate-100 shadow-sm hover:border-indigo-300 hover:shadow transition flex justify-between items-center gap-2">
                                                <div className="flex-1 min-w-0">
                                                    <h4 className="font-semibold text-slate-800 truncate leading-tight">{song.title}</h4>
                                                    {song.artist && <p className="text-xs text-slate-500 truncate mt-0.5">{song.artist}</p>}
                                                </div>
                                                <div className="flex items-center gap-1 shrink-0">
                                                    {song.lyrics && (
                                                        <button onClick={() => setSelectedSongLyrics(song)} className="text-slate-400 hover:text-indigo-600 p-2 rounded-full transition" title="View Lyrics">
                                                            <FileText size={18} />
                                                        </button>
                                                    )}
                                                    <button onClick={() => handleAddToWishlist(song)} className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white p-2 rounded-full transition" title="Add to Queue">
                                                        <Plus size={18} />
                                                    </button>
                                                    {/* Optional: Only show delete if they own it or simple mode allows anyone */}
                                                    <button onClick={() => handleDeleteFromRepertoire(song.id)} className="text-slate-300 hover:text-red-500 p-2 rounded-full transition md:opacity-0 md:group-hover:opacity-100" title="Delete Song">
                                                        <Trash2 size={16} />
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                </section>

                {/* Wishlist Section */}
                <section className="flex-1 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden h-full">
                    <div className="p-4 border-b border-amber-100 bg-amber-50 flex flex-col gap-3 shrink-0">
                        <div className="flex justify-between items-center">
                            <h2 className="text-lg font-semibold text-amber-800 flex items-center gap-2">
                                <ListMusic size={20} className="text-amber-500" />
                                Jam Queue
                            </h2>
                            <span className="bg-amber-200 text-amber-800 text-xs font-bold px-2.5 py-1 rounded-full">
                                {sortedWishlist.length}
                            </span>
                        </div>
                        <p className="text-sm text-amber-700/80">Songs requested by friends. Mark as played when done!</p>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-3 bg-amber-50/30">
                        {sortedWishlist.length === 0 ? (
                            <div className="text-center text-amber-600/60 p-8 flex flex-col items-center justify-center h-full">
                                <Music className="w-10 h-10 mb-2 opacity-50" />
                                <p>The queue is empty.</p>
                                <p className="text-sm">Click + on a song to request it.</p>
                            </div>
                        ) : (
                            <div className="flex flex-col gap-2">
                                {sortedWishlist.map((item, index) => (
                                    <div key={item.id} className="bg-white p-3 rounded-lg border border-amber-200 shadow-sm flex items-center gap-3">
                                        <div className="bg-amber-100 text-amber-700 font-bold rounded-full w-6 h-6 flex items-center justify-center shrink-0 text-sm">
                                            {index + 1}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="font-semibold text-slate-800 leading-tight truncate">{item.title}</h4>
                                            <div className="flex items-center gap-2 mt-1 text-xs">
                                                {item.artist && <span className="text-slate-500 truncate">{item.artist}</span>}
                                                {item.artist && <span className="text-slate-300">•</span>}
                                                <span className="font-medium text-amber-600 truncate">Req: {item.requestedBy}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            {item.lyrics && (
                                                <button onClick={() => setSelectedSongLyrics(item)} className="text-amber-500 hover:text-amber-700 p-2 rounded-full transition" title="View Lyrics">
                                                    <FileText size={18} />
                                                </button>
                                            )}
                                            <button onClick={() => handleRemoveFromWishlist(item.id)} className="bg-emerald-50 text-emerald-600 hover:bg-emerald-500 hover:text-white p-2 rounded-full transition" title="Mark as Played">
                                                <CheckCircle2 size={18} />
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </section>
            </main>

            {/* Modals */}
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add New Song">
                <form onSubmit={handleAddSong} className="flex flex-col h-full">
                    <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Song Title *</label>
                            <input 
                                type="text" 
                                required
                                value={newSong.title}
                                onChange={e => setNewSong({...newSong, title: e.target.value})}
                                className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                                placeholder="e.g. Fly Me To The Moon"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Artist / Note</label>
                            <input 
                                type="text" 
                                value={newSong.artist}
                                onChange={e => setNewSong({...newSong, artist: e.target.value})}
                                className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500" 
                                placeholder="e.g. Frank Sinatra"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Genre</label>
                            <select 
                                value={newSong.genre}
                                onChange={e => setNewSong({...newSong, genre: e.target.value})}
                                className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white"
                            >
                                {genres.map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Lyrics (Optional)</label>
                            <textarea 
                                rows="5" 
                                value={newSong.lyrics}
                                onChange={e => setNewSong({...newSong, lyrics: e.target.value})}
                                className="w-full px-3 py-2 rounded-md border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" 
                                placeholder="Paste lyrics here for singers..."
                            />
                        </div>
                    </div>
                    <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-2 shrink-0">
                        <button type="button" onClick={() => setIsAddModalOpen(false)} className="px-4 py-2 rounded-md text-slate-600 hover:bg-slate-200 font-medium transition">Cancel</button>
                        <button type="submit" className="px-4 py-2 rounded-md bg-indigo-600 text-white hover:bg-indigo-700 font-medium transition shadow-sm">Save Song</button>
                    </div>
                </form>
            </Modal>

            <LyricsModal 
                isOpen={!!selectedSongLyrics} 
                onClose={() => setSelectedSongLyrics(null)} 
                song={selectedSongLyrics} 
            />
        </div>
    );
}