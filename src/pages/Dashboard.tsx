import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { 
  Cpu, 
  MemoryStick, 
  Network, 
  List, 
  TerminalSquare, 
  Power, 
  StopCircle, 
  RotateCw, 
  XCircle, 
  AlertTriangle,
  Code2,
  Clock,
  CheckCircle2,
  Database,
  Users,
  FileText,
  Activity,
  Server
} from 'lucide-react';

export const Dashboard = () => {
  const [stats, setStats] = useState({
    questions: 0,
    assets: 0,
    users: 0,
    candidates: 0,
    exams: 0,
    nodes: 0,
  });
  const [stream, setStream] = useState<string[]>([
    `[${new Date().toLocaleTimeString()}] SYS_INIT: Boot sequence verified.`,
    `[${new Date().toLocaleTimeString()}] NET_MGR: Establishing connection with node...`
  ]);
  const [recentExams, setRecentExams] = useState<any[]>([]);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const [
          { count: qCount },
          { count: aCount },
          { count: uCount },
          { count: cCount },
          { count: eCount },
          { count: nCount },
          { data: recentQ },
          { data: recentA },
          { data: recentE }
        ] = await Promise.all([
          supabase.from('cau_hoi').select('*', { count: 'exact', head: true }),
          supabase.from('ngu_lieu').select('*', { count: 'exact', head: true }),
          supabase.from('users').select('*', { count: 'exact', head: true }),
          supabase.from('thi_sinh').select('*', { count: 'exact', head: true }),
          supabase.from('ky_thi').select('*', { count: 'exact', head: true }),
          supabase.from('kien_thuc').select('*', { count: 'exact', head: true }),
          supabase.from('cau_hoi').select('ma_cau_hoi').limit(3),
          supabase.from('ngu_lieu').select('ma_ngu_lieu').order('ma_ngu_lieu', { ascending: false }).limit(3),
          supabase.from('ky_thi').select('*').order('ngay_tao', { ascending: false }).limit(5)
        ]);

        setStats({
          questions: qCount || 0,
          assets: aCount || 0,
          users: uCount || 0,
          candidates: cCount || 0,
          exams: eCount || 0,
          nodes: nCount || 0,
        });

        if (recentE) {
          setRecentExams(recentE);
        }

        const newLogs = [
          `[${new Date().toLocaleTimeString()}] SYS_INIT: Database connected.`,
        ];
        
        recentQ?.forEach(q => {
          newLogs.push(`[${new Date().toLocaleTimeString()}] ALLOC: Synced Question ${q.ma_cau_hoi}`);
        });
        recentA?.forEach(a => {
          newLogs.push(`[${new Date().toLocaleTimeString()}] ALLOC: Synced Asset ${a.ma_ngu_lieu}`);
        });

        setStream(prev => [...prev, ...newLogs]);

      } catch (err) {
        console.error("Error fetching stats:", err);
      }
    };

    fetchStats();
  }, []);

  return (
    <div className="h-full flex flex-col bg-background text-on-surface font-mono -m-6 overflow-hidden">
      {/* Top Header */}
      <div className="flex justify-between items-center bg-background px-8 py-5 border-b border-outline-variant shrink-0">
        <div>
          <h1 className="text-2xl font-display font-bold text-on-surface tracking-wide flex items-center">
            Dashboard
          </h1>
          <div className="flex items-center text-xs text-outline-variant mt-1">
            <Activity className="w-3.5 h-3.5 mr-1.5 text-primary" />
            <span className="font-mono">System Control Overview</span>
          </div>
        </div>

        <div className="flex items-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            <span className="text-primary tracking-wider text-xs">SYS: ONLINE</span>
          </div>
          <div className="flex items-center gap-2 text-outline-variant">
            <Clock className="w-4 h-4" />
            <span className="tracking-wider text-xs">LATENCY: 12ms</span>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 px-4 py-2 border border-outline-variant rounded text-outline hover:text-on-surface transition-colors">
              <TerminalSquare className="w-4 h-4" />
              <span className="text-xs">Console</span>
            </button>
            <button className="flex items-center gap-2 px-4 py-2 bg-transparent hover:bg-primary/10 border border-primary rounded text-primary transition-colors">
              <Power className="w-4 h-4" />
              <span className="text-xs">Override</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Metrics Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-6">
            <div className="relative border border-outline-variant rounded-sm p-6 bg-surface/50 flex flex-col justify-between">
              {/* Corner Markers */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary"></div>
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary"></div>
              
              <div className="flex items-center gap-3 text-outline mb-4">
                <FileText className="w-5 h-5 text-primary" />
                <span className="text-xs tracking-widest uppercase font-bold text-outline">Total Questions</span>
              </div>
              <div className="text-4xl font-bold text-on-surface tracking-tight">{stats.questions.toLocaleString()}</div>
            </div>

            <div className="relative border border-outline-variant rounded-sm p-6 bg-surface/50 flex flex-col justify-between">
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary"></div>
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary"></div>
              
              <div className="flex items-center gap-3 text-outline mb-4">
                <MemoryStick className="w-5 h-5 text-secondary" />
                <span className="text-xs tracking-widest uppercase font-bold text-outline">Total Assets</span>
              </div>
              <div className="text-4xl font-bold text-primary tracking-tight">{stats.assets.toLocaleString()}</div>
            </div>

            <div className="relative border border-outline-variant rounded-sm p-6 bg-surface/50 flex flex-col justify-between">
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary"></div>
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary"></div>
              
              <div className="flex items-center gap-3 text-outline mb-4">
                <Users className="w-5 h-5 text-green-500" />
                <span className="text-xs tracking-widest uppercase font-bold text-outline">System Users</span>
              </div>
              <div className="text-4xl font-bold text-on-surface tracking-tight">{stats.users.toLocaleString()}</div>
            </div>
            
            <div className="relative border border-outline-variant rounded-sm p-6 bg-surface/50 flex flex-col justify-between md:col-span-3 xl:col-span-1">
              <div className="absolute top-0 left-0 w-2 h-2 border-t border-l border-primary"></div>
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b border-r border-primary"></div>
              
              <div className="flex items-center gap-3 text-outline mb-6">
                <List className="w-5 h-5 text-yellow-500" />
                <span className="text-xs tracking-widest uppercase font-bold text-outline">Entity Status</span>
              </div>
              <div className="flex justify-between items-end">
                <div className="flex flex-col items-center">
                  <span className="text-xl font-bold text-primary">{stats.candidates.toLocaleString()}</span>
                  <span className="text-[10px] text-outline-variant tracking-wider mt-1">CANDIDATES</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-xl font-bold text-error">{stats.exams.toLocaleString()}</span>
                  <span className="text-[10px] text-outline-variant tracking-wider mt-1">EXAMS</span>
                </div>
                <div className="flex flex-col items-center">
                  <span className="text-xl font-bold text-on-surface">{stats.nodes.toLocaleString()}</span>
                  <span className="text-[10px] text-outline-variant tracking-wider mt-1">NODES</span>
                </div>
              </div>
            </div>
          </div>

          {/* Main Split */}
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* Left: Recent Exams */}
            <div className="lg:col-span-3 border border-outline-variant rounded-sm flex flex-col bg-surface/30">
              <div className="p-5 border-b border-outline-variant flex justify-between items-center bg-background">
                <div className="flex items-center gap-3">
                  <FileText className="w-4 h-4 text-primary" />
                  <span className="tracking-widest text-xs font-bold text-on-surface uppercase">Recent Exams</span>
                </div>
              </div>
              
              <div className="p-5 overflow-x-auto">
                <table className="w-full text-left text-xs whitespace-nowrap">
                  <thead className="text-outline-variant">
                    <tr>
                      <th className="font-normal px-4 py-3 tracking-wider uppercase text-[10px]">Exam Code</th>
                      <th className="font-normal px-4 py-3 tracking-wider uppercase text-[10px]">Name</th>
                      <th className="font-normal px-4 py-3 tracking-wider uppercase text-[10px]">Subject</th>
                      <th className="font-normal px-4 py-3 tracking-wider uppercase text-[10px]">Type</th>
                      <th className="font-normal px-4 py-3 tracking-wider uppercase text-[10px]">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-outline-variant text-on-surface">
                    {recentExams.length > 0 ? recentExams.map((exam) => (
                      <tr key={exam.ma_ky_thi} className="hover:bg-surface-bright/50 transition-colors group">
                        <td className="px-4 py-4 font-mono text-primary">{exam.ma_ky_thi}</td>
                        <td className="px-4 py-4 truncate max-w-[150px]" title={exam.ten_ky_thi}>{exam.ten_ky_thi}</td>
                        <td className="px-4 py-4 text-outline-variant">{exam.ma_ky_thi || '--'}</td>
                        <td className="px-4 py-4 text-outline-variant">{'Final'}</td>
                        <td className="px-4 py-4">
                          <span className="px-2 py-1 rounded text-[10px] font-bold tracking-wider uppercase bg-primary/10 text-primary border border-primary/20">
                            {exam.trang_thai || 'Active'}
                          </span>
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-outline-variant italic">No recent exams found.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right: Terminal Stream */}
            <div className="lg:col-span-2 border border-outline-variant rounded-sm flex flex-col bg-surface/30 h-[450px]">
              <div className="p-5 border-b border-outline-variant flex justify-between items-center bg-background">
                <div className="flex items-center gap-3 text-primary">
                  <Code2 className="w-4 h-4" />
                  <span className="tracking-widest text-xs font-bold uppercase">Terminal Stream</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-green-500 text-[10px] tracking-wider font-bold">LIVE</span>
                </div>
              </div>
              
              <div className="flex-1 p-5 overflow-auto text-xs leading-relaxed font-mono space-y-2 custom-scrollbar">
                {stream.map((log, index) => (
                  <div key={index} className="text-on-surface">
                    {log.startsWith('>') ? (
                      <div className="text-primary pl-4">{log}</div>
                    ) : log.includes('WARN') ? (
                      <div className="text-tertiary">{log}</div>
                    ) : log.includes('CRITICAL') ? (
                      <div className="text-error">{log}</div>
                    ) : (
                      <div>
                        <span className="text-outline-variant mr-2">{log.substring(0, log.indexOf(']') + 1)}</span>
                        {log.substring(log.indexOf(']') + 1)}
                      </div>
                    )}
                  </div>
                ))}
                <div className="text-primary animate-pulse mt-2">_</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

