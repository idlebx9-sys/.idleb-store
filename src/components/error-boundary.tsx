import React from 'react';
export class ErrorBoundary extends React.Component<{children:React.ReactNode},{hasError:boolean}>{state={hasError:false};static getDerivedStateFromError(){return {hasError:true}};componentDidCatch(e:unknown){console.error(e)};render(){return this.state.hasError?<div style={{padding:24,fontFamily:'sans-serif'}}>حدث خطأ غير متوقع. أعد تحميل الصفحة.</div>:this.props.children}}</nEOF
rm -rf node_modules package-lock.json
npm install --no-audit --no-fund
