// js/ui-helpers.js
export const copyArtifactDetails = () => {
    const artifactText = document.getElementById("artifactDisplay").innerText;
    navigator.clipboard.writeText(artifactText)
      .then(() => showToast("Artifact details copied to clipboard!"))
      .catch(err => showToast("Failed to copy: " + err));
  };
  
  export const showToast = message => {
    const toastContainer = document.getElementById("toastContainer");
    const toast = document.createElement("div");
    toast.classList.add("toast");
    toast.setAttribute("role", "alert");
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => {
      toast.classList.add("show");
      setTimeout(() => {
        toast.classList.remove("show");
        setTimeout(() => { toastContainer.removeChild(toast); }, 300);
      }, 3000);
    }, 10);
  };