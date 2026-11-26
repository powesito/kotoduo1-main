import { Component } from "react";

// Si un componente falla al dibujarse, se muestra un aviso en vez de dejar toda la pantalla en blanco.
export default class ErrorBoundary extends Component {
  state = { error: null };
  static getDerivedStateFromError(error) {
    return { error };
  }
  componentDidCatch(error, info) {
    console.error("Error de interfaz:", error, info.componentStack);
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="msg error" role="alert">
        <p>
          <b>Algo salió mal al mostrar esta pantalla.</b> Tus datos están a salvo.
        </p>
        <button onClick={() => this.setState({ error: null })}>Reintentar</button>{" "}
        <button className="sec" onClick={() => location.reload()}>
          Recargar la página
        </button>
      </div>
    );
  }
}
